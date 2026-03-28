from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import InstanceType, Pricing, Provider, Region, ServiceCategory
from app.schemas.pricing import (
    CompareAppRequest,
    CompareAppResponse,
    CompareServiceInput,
    InstanceTypeOut,
    PricingDetailOut,
    PricingOut,
    ProviderOut,
    RegionOut,
    ServiceCategoryOut,
    ServiceComparisonOut,
    ServiceEquivalentOut,
    ProviderTotalsOut,
)
from app.utils.region_mapping import get_equivalent_regions

router = APIRouter(prefix="/api")

HOURS_PER_MONTH = 730.0
ALL_PROVIDERS = ["aws", "azure", "gcp"]


# ─── Providers ──────────────────────────────────────────────────────────────


@router.get("/providers", response_model=list[ProviderOut])
def list_providers(db: Session = Depends(get_db)):
    return db.scalars(select(Provider).order_by(Provider.name)).all()


@router.get("/providers/{provider_id}/regions", response_model=list[RegionOut])
def list_regions(provider_id: int, db: Session = Depends(get_db)):
    provider = db.get(Provider, provider_id)
    if not provider:
        raise HTTPException(404, "Provider not found")
    return db.scalars(
        select(Region).where(Region.provider_id == provider_id).order_by(Region.code)
    ).all()


@router.get(
    "/providers/{provider_id}/instance-types", response_model=list[InstanceTypeOut]
)
def list_instance_types(
    provider_id: int,
    service_category: str | None = Query(None),
    region_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    provider = db.get(Provider, provider_id)
    if not provider:
        raise HTTPException(404, "Provider not found")

    stmt = select(InstanceType).where(InstanceType.provider_id == provider_id)

    if service_category:
        cat = db.scalars(
            select(ServiceCategory).where(ServiceCategory.name == service_category)
        ).first()
        if cat:
            stmt = stmt.where(InstanceType.service_category_id == cat.id)

    if region_id is not None:
        stmt = stmt.where(
            InstanceType.id.in_(
                select(Pricing.instance_type_id).where(
                    Pricing.region_id == region_id,
                    Pricing.price_per_hour_ondemand > 0,
                )
            )
        )

    return db.scalars(stmt.order_by(InstanceType.name)).all()


# ─── Service Categories ──────────────────────────────────────────────────────


@router.get("/service-categories", response_model=list[ServiceCategoryOut])
def list_service_categories(db: Session = Depends(get_db)):
    return db.scalars(select(ServiceCategory).order_by(ServiceCategory.name)).all()


# ─── Pricing ─────────────────────────────────────────────────────────────────


@router.get("/pricing", response_model=list[PricingOut])
def get_pricing(
    instance_type_id: int | None = Query(None),
    region_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    stmt = select(Pricing)
    if instance_type_id is not None:
        stmt = stmt.where(Pricing.instance_type_id == instance_type_id)
    if region_id is not None:
        stmt = stmt.where(Pricing.region_id == region_id)
    return db.scalars(stmt).all()


@router.get("/pricing/compare", response_model=list[PricingDetailOut])
def compare_pricing(
    equivalent_group: str = Query(...),
    region_codes: str = Query(..., description="Comma-separated region codes"),
    db: Session = Depends(get_db),
):
    codes = [c.strip() for c in region_codes.split(",") if c.strip()]

    stmt = (
        select(Pricing)
        .join(Pricing.instance_type)
        .join(Pricing.region)
        .options(
            joinedload(Pricing.instance_type).joinedload(InstanceType.provider),
            joinedload(Pricing.region),
        )
        .where(
            InstanceType.equivalent_group == equivalent_group,
            Region.code.in_(codes),
        )
    )

    rows = db.scalars(stmt).unique().all()

    return [
        PricingDetailOut(
            instance_type=InstanceTypeOut.model_validate(p.instance_type),
            region=RegionOut.model_validate(p.region),
            provider=ProviderOut.model_validate(p.instance_type.provider),
            price_per_hour_ondemand=float(p.price_per_hour_ondemand),
            price_per_hour_reserved_1y=(
                float(p.price_per_hour_reserved_1y)
                if p.price_per_hour_reserved_1y is not None
                else None
            ),
            price_per_hour_reserved_3y=(
                float(p.price_per_hour_reserved_3y)
                if p.price_per_hour_reserved_3y is not None
                else None
            ),
            currency=p.currency,
            last_updated=p.last_updated,
        )
        for p in rows
    ]


# ─── Multi-cloud app comparison (new) ────────────────────────────────────────


def _compute_monthly(
    price_hourly: float,
    svc: CompareServiceInput,
) -> float:
    """Compute monthly cost from an hourly rate, applying utilization + category params."""
    unit = svc.pricing_unit or "per_hour"
    util = float(svc.utilization_rate)

    if unit == "per_gb_month":
        volume = float(svc.volume_gb) if svc.volume_gb else 100.0
        return price_hourly * volume

    if unit == "per_request":
        reqs = int(svc.monthly_requests) if svc.monthly_requests else 1_000_000
        return price_hourly * reqs

    if unit == "per_gb_second":
        reqs = int(svc.monthly_requests) if svc.monthly_requests else 1_000_000
        dur_s = float(svc.avg_duration_ms or 200) / 1000.0
        mem_gb = float(svc.memory_mb or 512) / 1024.0
        return price_hourly * reqs * dur_s * mem_gb

    if unit in ("per_cluster_hour", "per_vcpu_hour", "per_gb_hour"):
        nodes = int(svc.node_count) if svc.node_count else 1
        return price_hourly * nodes * util * HOURS_PER_MONTH

    # Default: per_hour
    return price_hourly * util * HOURS_PER_MONTH


def _effective_monthly(
    price_hourly_od: float,
    price_1y: float | None,
    price_3y: float | None,
    svc: CompareServiceInput,
) -> float:
    """Return the effective (possibly RI) monthly cost."""
    if svc.reserved:
        ri_price = None
        if svc.reserved_term == "3y" and price_3y is not None:
            ri_price = price_3y
        elif price_1y is not None:
            ri_price = price_1y
        if ri_price is not None:
            return _compute_monthly(ri_price, svc)
    return _compute_monthly(price_hourly_od, svc)


def _find_best_pricing(
    equivalent_group: str,
    provider_name: str,
    target_region_code: str,
    db: Session,
) -> Pricing | None:
    """
    Find the best Pricing row for (equivalent_group, provider, region).

    Falls back to any region of that provider if the target region has no data.
    """
    provider = db.scalars(
        select(Provider).where(Provider.name == provider_name)
    ).first()
    if not provider:
        return None

    # Exact match: equivalent_group + provider + target region
    stmt = (
        select(Pricing)
        .join(Pricing.instance_type)
        .join(Pricing.region)
        .options(
            joinedload(Pricing.instance_type).joinedload(InstanceType.service_category),
            joinedload(Pricing.region),
        )
        .where(
            InstanceType.provider_id == provider.id,
            InstanceType.equivalent_group == equivalent_group,
            Region.code == target_region_code,
        )
        .limit(1)
    )
    row = db.scalars(stmt).first()
    if row:
        return row

    # Fallback: same group, same provider, any region
    stmt_any = (
        select(Pricing)
        .join(Pricing.instance_type)
        .join(Pricing.region)
        .options(
            joinedload(Pricing.instance_type).joinedload(InstanceType.service_category),
            joinedload(Pricing.region),
        )
        .where(
            InstanceType.provider_id == provider.id,
            InstanceType.equivalent_group == equivalent_group,
        )
        .limit(1)
    )
    return db.scalars(stmt_any).first()


@router.post("/pricing/compare-app", response_model=CompareAppResponse)
def compare_app(
    body: CompareAppRequest,
    db: Session = Depends(get_db),
):
    """
    Full multi-cloud comparison for an application's services.

    For each service:
      1. Resolve its equivalent_group.
      2. Map its region to equivalent regions on all 3 providers.
      3. Find the best-matching instance per provider.
      4. Compute per-provider monthly costs.

    Returns per-service breakdowns + per-provider totals.
    """
    if not body.services:
        return CompareAppResponse(services=[], provider_totals={})

    # Pre-load all providers
    providers_by_name: dict[str, Provider] = {
        p.name: p
        for p in db.scalars(select(Provider)).all()
    }

    # Pre-load original instance types + their regions
    original_region_codes: dict[str, str] = {}  # region_id → region.code
    for svc in body.services:
        if svc.region_id not in original_region_codes:
            region = db.get(Region, svc.region_id)
            if region:
                original_region_codes[svc.region_id] = region.code

    # Accumulate totals per provider
    provider_totals: dict[str, dict] = {
        p: {"od": 0.0, "eff": 0.0, "mapped": 0, "total": len(body.services), "region": ""}
        for p in ALL_PROVIDERS
    }

    service_results: list[ServiceComparisonOut] = []

    for svc in body.services:
        # Get original instance
        it = db.get(InstanceType, svc.instance_type_id)
        if not it:
            service_results.append(ServiceComparisonOut(
                service_id=svc.service_id,
                original_instance="(unknown)",
                original_monthly_cost=0.0,
                equivalent_group=None,
                equivalents={p: None for p in ALL_PROVIDERS},
            ))
            continue

        # Original monthly cost (on-demand)
        orig_pricing = db.scalars(
            select(Pricing).where(
                Pricing.instance_type_id == svc.instance_type_id,
                Pricing.region_id == svc.region_id,
            )
        ).first()
        if orig_pricing:
            orig_od = _compute_monthly(float(orig_pricing.price_per_hour_ondemand), svc)
            orig_1y = float(orig_pricing.price_per_hour_reserved_1y) if orig_pricing.price_per_hour_reserved_1y else None
            orig_3y = float(orig_pricing.price_per_hour_reserved_3y) if orig_pricing.price_per_hour_reserved_3y else None
            original_monthly = _effective_monthly(
                float(orig_pricing.price_per_hour_ondemand), orig_1y, orig_3y, svc
            )
        else:
            orig_od = 0.0
            original_monthly = 0.0

        equiv_group = it.equivalent_group
        source_region_code = original_region_codes.get(svc.region_id, "us-east-1")
        region_map = get_equivalent_regions(source_region_code)

        equivalents: dict[str, ServiceEquivalentOut | None] = {}

        for provider_name in ALL_PROVIDERS:
            target_region_code = region_map.get(provider_name, source_region_code)

            if equiv_group:
                pricing_row = _find_best_pricing(
                    equiv_group, provider_name, target_region_code, db
                )
            else:
                pricing_row = None

            if pricing_row is None:
                equivalents[provider_name] = None
                # Add original prices to totals (no equivalent found = use own prices for that provider)
                provider_totals[provider_name]["od"] += orig_od
                provider_totals[provider_name]["eff"] += original_monthly
                if provider_totals[provider_name]["region"] == "" and pricing_row is None:
                    provider_totals[provider_name]["region"] = target_region_code
                continue

            provider_totals[provider_name]["mapped"] += 1

            od_price = float(pricing_row.price_per_hour_ondemand)
            r1y = float(pricing_row.price_per_hour_reserved_1y) if pricing_row.price_per_hour_reserved_1y else None
            r3y = float(pricing_row.price_per_hour_reserved_3y) if pricing_row.price_per_hour_reserved_3y else None

            monthly_od = _compute_monthly(od_price, svc)
            monthly_eff = _effective_monthly(od_price, r1y, r3y, svc)

            provider_totals[provider_name]["od"] += monthly_od
            provider_totals[provider_name]["eff"] += monthly_eff

            region_row = pricing_row.region
            if provider_totals[provider_name]["region"] == "":
                provider_totals[provider_name]["region"] = region_row.display_name

            equivalents[provider_name] = ServiceEquivalentOut(
                instance_name=pricing_row.instance_type.name,
                region_code=region_row.code,
                region_display_name=region_row.display_name,
                price_per_hour_ondemand=od_price,
                price_per_hour_reserved_1y=r1y,
                price_per_hour_reserved_3y=r3y,
                monthly_cost_ondemand=monthly_od,
                monthly_cost_effective=monthly_eff,
            )

        service_results.append(ServiceComparisonOut(
            service_id=svc.service_id,
            original_instance=it.name,
            original_monthly_cost=original_monthly,
            equivalent_group=equiv_group,
            equivalents=equivalents,
        ))

    totals_out: dict[str, ProviderTotalsOut] = {
        p: ProviderTotalsOut(
            total_monthly_ondemand=round(provider_totals[p]["od"], 2),
            total_monthly_effective=round(provider_totals[p]["eff"], 2),
            mapped_services=provider_totals[p]["mapped"],
            total_services=provider_totals[p]["total"],
            region_display_name=provider_totals[p]["region"],
        )
        for p in ALL_PROVIDERS
    }

    return CompareAppResponse(services=service_results, provider_totals=totals_out)
