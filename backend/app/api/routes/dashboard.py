from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import AppService, Application, InstanceType, Pricing, Project
from app.api.routes.projects import _service_monthly_cost, _fetch_pricing_map, HOURS_PER_MONTH

router = APIRouter(prefix="/api")


# ─── Response schemas ─────────────────────────────────────────────────────────


class CostByProvider(BaseModel):
    provider_name: str
    total_monthly_cost: float
    percentage: float


class CostByCategory(BaseModel):
    category_name: str
    total_monthly_cost: float
    percentage: float


class TopApplication(BaseModel):
    app_id: str
    app_name: str
    project_name: str
    provider: str
    monthly_cost: float


class ProjectSummary(BaseModel):
    id: str
    name: str
    app_count: int
    monthly_cost: float
    savings: float
    ri_coverage: float


class DashboardOut(BaseModel):
    total_monthly_cost: float
    total_annual_cost: float
    total_savings: float
    global_ri_coverage: float
    project_count: int
    application_count: int
    service_count: int
    cost_by_provider: list[CostByProvider]
    cost_by_service_category: list[CostByCategory]
    top_5_applications: list[TopApplication]
    projects_summary: list[ProjectSummary]


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _ondemand_monthly(svc: AppService, price: Pricing | None) -> float:
    """Monthly cost at full on-demand rate (no RI)."""
    if price is None:
        return 0.0
    raw = float(price.price_per_hour_ondemand)
    unit = (
        svc.instance_type.pricing_unit
        if svc.instance_type and svc.instance_type.pricing_unit
        else "per_hour"
    )
    if unit == "per_gb_month":
        return raw * float(svc.volume_gb or 100)
    if unit == "per_request":
        return raw * int(svc.monthly_requests or 1_000_000)
    if unit == "per_gb_second":
        return (
            raw
            * int(svc.monthly_requests or 1_000_000)
            * float(svc.avg_duration_ms or 200)
            / 1000.0
            * float(svc.memory_mb or 512)
            / 1024.0
        )
    if unit in ("per_cluster_hour", "per_vcpu_hour", "per_gb_hour"):
        return raw * int(svc.node_count or 1) * float(svc.utilization_rate) * HOURS_PER_MONTH
    # per_hour (compute / database) — always on-demand
    return raw * HOURS_PER_MONTH * float(svc.utilization_rate)


# ─── Endpoint ─────────────────────────────────────────────────────────────────


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(db: Session = Depends(get_db)):
    projects = (
        db.scalars(
            select(Project).options(
                joinedload(Project.applications)
                .joinedload(Application.services)
                .joinedload(AppService.instance_type)
                .joinedload(InstanceType.service_category),
                joinedload(Project.applications).joinedload(Application.region),
            )
        )
        .unique()
        .all()
    )

    # Bulk-fetch all pricing for every service in one query
    all_pairs = [
        (svc.instance_type_id, app.region_id)
        for proj in projects
        for app in proj.applications
        for svc in app.services
    ]
    pricing_map = _fetch_pricing_map(db, all_pairs)

    total_od = 0.0
    total_eff = 0.0
    total_services = 0
    ri_services = 0

    by_provider: dict[str, float] = {}
    by_category: dict[str, float] = {}
    app_entries: list[tuple[Application, str, float]] = []

    proj_summaries = []

    for proj in projects:
        proj_od = 0.0
        proj_eff = 0.0
        proj_ri = 0
        proj_svc_count = 0

        for app in proj.applications:
            app_eff = 0.0

            for svc in app.services:
                pricing = pricing_map.get((svc.instance_type_id, app.region_id))

                od = _ondemand_monthly(svc, pricing)
                eff = _service_monthly_cost(svc, pricing)

                total_od += od
                total_eff += eff
                proj_od += od
                proj_eff += eff
                app_eff += eff
                total_services += 1
                proj_svc_count += 1

                if svc.reserved:
                    ri_services += 1
                    proj_ri += 1

                prov = app.provider
                by_provider[prov] = by_provider.get(prov, 0.0) + eff

                cat = "other"
                if svc.instance_type and svc.instance_type.service_category:
                    cat = svc.instance_type.service_category.name
                by_category[cat] = by_category.get(cat, 0.0) + eff

            app_entries.append((app, proj.name, app_eff))

        ri_cov = (proj_ri / proj_svc_count * 100) if proj_svc_count > 0 else 0.0
        proj_summaries.append(
            ProjectSummary(
                id=proj.id,
                name=proj.name,
                app_count=len(proj.applications),
                monthly_cost=round(proj_eff, 2),
                savings=round(proj_od - proj_eff, 2),
                ri_coverage=round(ri_cov, 1),
            )
        )

    total_savings = total_od - total_eff
    global_ri = (ri_services / total_services * 100) if total_services > 0 else 0.0
    application_count = sum(len(p.applications) for p in projects)

    top_5_sorted = sorted(app_entries, key=lambda x: x[2], reverse=True)[:5]
    top_5 = [
        TopApplication(
            app_id=app.id,
            app_name=app.name,
            project_name=proj_name,
            provider=app.provider,
            monthly_cost=round(cost, 2),
        )
        for app, proj_name, cost in top_5_sorted
    ]

    cost_by_provider = [
        CostByProvider(
            provider_name=prov,
            total_monthly_cost=round(cost, 2),
            percentage=round(cost / total_eff * 100, 1) if total_eff > 0 else 0.0,
        )
        for prov, cost in sorted(by_provider.items(), key=lambda x: -x[1])
    ]

    cost_by_category = [
        CostByCategory(
            category_name=cat,
            total_monthly_cost=round(cost, 2),
            percentage=round(cost / total_eff * 100, 1) if total_eff > 0 else 0.0,
        )
        for cat, cost in sorted(by_category.items(), key=lambda x: -x[1])
    ]

    return DashboardOut(
        total_monthly_cost=round(total_eff, 2),
        total_annual_cost=round(total_eff * 12, 2),
        total_savings=round(total_savings, 2),
        global_ri_coverage=round(global_ri, 1),
        project_count=len(projects),
        application_count=application_count,
        service_count=total_services,
        cost_by_provider=cost_by_provider,
        cost_by_service_category=cost_by_category,
        top_5_applications=top_5,
        projects_summary=proj_summaries,
    )
