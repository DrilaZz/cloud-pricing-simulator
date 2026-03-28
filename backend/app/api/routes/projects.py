from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session, joinedload

import json

from app.database import get_db
from app.models import AppService, Application, InstanceType, Pricing, Project, Region
from app.models.custom_template import CustomTemplate
from app.models.provider import Provider
from app.schemas.pricing import InstanceTypeOut, RegionOut
from app.schemas.projects import (
    AppServiceCreate,
    AppServiceOut,
    AppServiceUpdate,
    ApplicationCreate,
    ApplicationFromTemplateCreate,
    ApplicationOut,
    ApplicationUpdate,
    ProjectCreate,
    ProjectListOut,
    ProjectOut,
    ProjectUpdate,
)

router = APIRouter(prefix="/api")

HOURS_PER_MONTH = 730


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _service_monthly_cost(svc: AppService, price: Pricing | None) -> float:
    if price is None:
        return 0.0

    raw_price = float(price.price_per_hour_ondemand)
    pricing_unit = (
        svc.instance_type.pricing_unit
        if svc.instance_type and svc.instance_type.pricing_unit
        else "per_hour"
    )

    if pricing_unit == "per_gb_month":
        volume = float(svc.volume_gb) if svc.volume_gb else 100.0
        return raw_price * volume

    elif pricing_unit == "per_request":
        requests = int(svc.monthly_requests) if svc.monthly_requests else 1_000_000
        return raw_price * requests

    elif pricing_unit == "per_gb_second":
        requests = int(svc.monthly_requests) if svc.monthly_requests else 1_000_000
        duration_s = float(svc.avg_duration_ms or 200) / 1000.0
        memory_gb = float(svc.memory_mb or 512) / 1024.0
        return raw_price * requests * duration_s * memory_gb

    elif pricing_unit in ("per_cluster_hour", "per_vcpu_hour", "per_gb_hour"):
        nodes = int(svc.node_count) if svc.node_count else 1
        util = float(svc.utilization_rate)
        return raw_price * nodes * util * HOURS_PER_MONTH

    else:  # per_hour — compute and database
        od = raw_price * HOURS_PER_MONTH * float(svc.utilization_rate)
        if not svc.reserved:
            return od
        if svc.reserved_term == "1y" and price.price_per_hour_reserved_1y is not None:
            return (
                float(price.price_per_hour_reserved_1y)
                * HOURS_PER_MONTH
                * float(svc.utilization_rate)
            )
        if svc.reserved_term == "3y" and price.price_per_hour_reserved_3y is not None:
            return (
                float(price.price_per_hour_reserved_3y)
                * HOURS_PER_MONTH
                * float(svc.utilization_rate)
            )
        return od


def _fetch_pricing_map(
    db: Session, pairs: list[tuple[int, int]]
) -> dict[tuple[int, int], Pricing]:
    """Fetch all pricing rows for the given (instance_type_id, region_id) pairs
    in a single query. Returns a dict keyed by (instance_type_id, region_id)."""
    if not pairs:
        return {}
    unique_pairs = list(set(pairs))
    rows = db.scalars(
        select(Pricing).where(
            tuple_(Pricing.instance_type_id, Pricing.region_id).in_(unique_pairs)
        )
    ).all()
    return {(p.instance_type_id, p.region_id): p for p in rows}


def _build_service_out(svc: AppService, pricing: Pricing | None) -> AppServiceOut:
    sc_name = None
    if (
        svc.instance_type
        and hasattr(svc.instance_type, "service_category")
        and svc.instance_type.service_category
    ):
        sc_name = svc.instance_type.service_category.name

    return AppServiceOut(
        id=svc.id,
        application_id=svc.application_id,
        instance_type_id=svc.instance_type_id,
        utilization_rate=float(svc.utilization_rate),
        reserved=svc.reserved,
        reserved_term=svc.reserved_term,
        created_at=svc.created_at,
        volume_gb=svc.volume_gb,
        monthly_requests=svc.monthly_requests,
        avg_duration_ms=svc.avg_duration_ms,
        memory_mb=svc.memory_mb,
        node_count=svc.node_count,
        deployment_option=svc.deployment_option,
        instance_type=InstanceTypeOut.model_validate(svc.instance_type),
        service_category_name=sc_name,
        price_per_hour_ondemand=float(pricing.price_per_hour_ondemand) if pricing else None,
        price_per_hour_reserved_1y=(
            float(pricing.price_per_hour_reserved_1y)
            if pricing and pricing.price_per_hour_reserved_1y is not None
            else None
        ),
        price_per_hour_reserved_3y=(
            float(pricing.price_per_hour_reserved_3y)
            if pricing and pricing.price_per_hour_reserved_3y is not None
            else None
        ),
    )


def _build_app_out(app_: Application, db: Session) -> ApplicationOut:
    # Bulk-fetch all pricing for this app's services in a single query
    pairs = [(svc.instance_type_id, app_.region_id) for svc in app_.services]
    pricing_map = _fetch_pricing_map(db, pairs)

    services_out: list[AppServiceOut] = []
    monthly = 0.0

    for svc in app_.services:
        pricing = pricing_map.get((svc.instance_type_id, app_.region_id))
        services_out.append(_build_service_out(svc, pricing))
        monthly += _service_monthly_cost(svc, pricing)

    return ApplicationOut(
        id=app_.id,
        project_id=app_.project_id,
        name=app_.name,
        provider=app_.provider,
        region_id=app_.region_id,
        region=RegionOut.model_validate(app_.region),
        created_at=app_.created_at,
        updated_at=app_.updated_at,
        services=services_out,
        monthly_cost=round(monthly, 2),
    )


def _load_project(project_id: str, db: Session) -> Project:
    project = (
        db.scalars(
            select(Project)
            .where(Project.id == project_id)
            .options(
                joinedload(Project.applications).joinedload(Application.region),
                joinedload(Project.applications)
                .joinedload(Application.services)
                .joinedload(AppService.instance_type)
                .joinedload(InstanceType.service_category),
            )
        )
        .unique()
        .first()
    )
    if not project:
        raise HTTPException(404, "Project not found")
    return project


# ─── Projects ─────────────────────────────────────────────────────────────────


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(name=body.name, description=body.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        applications=[],
        monthly_cost=0.0,
    )


@router.get("/projects", response_model=list[ProjectListOut])
def list_projects(db: Session = Depends(get_db)):
    projects = (
        db.scalars(
            select(Project)
            .options(
                joinedload(Project.applications)
                .joinedload(Application.services)
                .joinedload(AppService.instance_type)
                .joinedload(InstanceType.service_category),
                joinedload(Project.applications).joinedload(Application.region),
            )
            .order_by(Project.created_at.desc())
        )
        .unique()
        .all()
    )

    # Bulk-fetch all pricing for all services across all projects in one query
    all_pairs = [
        (svc.instance_type_id, app_.region_id)
        for proj in projects
        for app_ in proj.applications
        for svc in app_.services
    ]
    pricing_map = _fetch_pricing_map(db, all_pairs)

    result: list[ProjectListOut] = []
    for proj in projects:
        total = 0.0
        providers = list(set(app_.provider for app_ in proj.applications))
        for app_ in proj.applications:
            for svc in app_.services:
                pricing = pricing_map.get((svc.instance_type_id, app_.region_id))
                total += _service_monthly_cost(svc, pricing)
        result.append(
            ProjectListOut(
                id=proj.id,
                name=proj.name,
                description=proj.description,
                created_at=proj.created_at,
                updated_at=proj.updated_at,
                application_count=len(proj.applications),
                monthly_cost=round(total, 2),
                providers=providers,
            )
        )
    return result


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = _load_project(project_id, db)

    apps_out: list[ApplicationOut] = []
    total = 0.0
    for app_ in project.applications:
        app_out = _build_app_out(app_, db)
        apps_out.append(app_out)
        total += app_out.monthly_cost

    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        applications=apps_out,
        monthly_cost=round(total, 2),
    )


@router.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db)):
    project = _load_project(project_id, db)
    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    db.commit()
    return get_project(project_id, db)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    db.delete(project)
    db.commit()


# ─── Applications ─────────────────────────────────────────────────────────────


@router.post(
    "/projects/{project_id}/applications",
    response_model=ApplicationOut,
    status_code=201,
)
def create_application(
    project_id: str, body: ApplicationCreate, db: Session = Depends(get_db)
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    region = db.get(Region, body.region_id)
    if not region:
        raise HTTPException(400, "Invalid region_id")

    app_ = Application(
        project_id=project_id,
        name=body.name,
        provider=body.provider,
        region_id=body.region_id,
    )
    db.add(app_)
    db.commit()
    db.refresh(app_)
    app_.region = region

    return ApplicationOut(
        id=app_.id,
        project_id=app_.project_id,
        name=app_.name,
        provider=app_.provider,
        region_id=app_.region_id,
        region=RegionOut.model_validate(region),
        created_at=app_.created_at,
        updated_at=app_.updated_at,
        services=[],
        monthly_cost=0.0,
    )


@router.post(
    "/projects/{project_id}/applications/from-template",
    response_model=ApplicationOut,
    status_code=201,
)
def create_application_from_template(
    project_id: str,
    body: ApplicationFromTemplateCreate,
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    region = db.get(Region, body.region_id)
    if not region:
        raise HTTPException(400, "Invalid region_id")

    template = db.get(CustomTemplate, body.template_id)
    if not template:
        raise HTTPException(404, "Template not found")

    provider_obj = db.scalars(
        select(Provider).where(Provider.name == body.provider)
    ).first()
    if not provider_obj:
        raise HTTPException(400, "Invalid provider")

    app_ = Application(
        project_id=project_id,
        name=body.name,
        provider=body.provider,
        region_id=body.region_id,
    )
    db.add(app_)
    db.flush()

    services_spec: list[dict] = json.loads(template.services_json or "[]")
    for spec in services_spec:
        equivalent_group = spec.get("equivalent_group")
        if not equivalent_group:
            continue

        instance_type = db.scalars(
            select(InstanceType)
            .where(
                InstanceType.provider_id == provider_obj.id,
                InstanceType.equivalent_group == equivalent_group,
            )
            .limit(1)
        ).first()
        if not instance_type:
            continue

        # Check pricing in the requested region; fall back to any region
        pricing = db.scalars(
            select(Pricing).where(
                Pricing.instance_type_id == instance_type.id,
                Pricing.region_id == body.region_id,
            )
        ).first()
        if not pricing:
            any_p = db.scalars(
                select(Pricing)
                .join(Region, Pricing.region_id == Region.id)
                .where(
                    Pricing.instance_type_id == instance_type.id,
                    Region.provider_id == provider_obj.id,
                )
                .limit(1)
            ).first()
            if not any_p:
                continue

        node_count = spec.get("node_count")
        repeat = 1
        if node_count and node_count > 1 and equivalent_group.startswith("compute"):
            repeat = node_count
            node_count = None

        for _ in range(repeat):
            svc = AppService(
                application_id=app_.id,
                instance_type_id=instance_type.id,
                utilization_rate=spec.get("utilization_rate", 1.0),
                reserved=spec.get("reserved", False),
                reserved_term=spec.get("reserved_term"),
                volume_gb=spec.get("volume_gb"),
                monthly_requests=spec.get("monthly_requests"),
                avg_duration_ms=spec.get("avg_duration_ms"),
                memory_mb=spec.get("memory_mb"),
                node_count=node_count,
                deployment_option=spec.get("deployment_option"),
            )
            db.add(svc)

    db.commit()

    # Reload with full relationships
    app_ = (
        db.scalars(
            select(Application)
            .where(Application.id == app_.id)
            .options(
                joinedload(Application.region),
                joinedload(Application.services)
                .joinedload(AppService.instance_type)
                .joinedload(InstanceType.service_category),
            )
        )
        .unique()
        .first()
    )
    return _build_app_out(app_, db)


@router.get(
    "/projects/{project_id}/applications",
    response_model=list[ApplicationOut],
)
def list_applications(project_id: str, db: Session = Depends(get_db)):
    project = _load_project(project_id, db)
    return [_build_app_out(app_, db) for app_ in project.applications]


@router.put("/applications/{app_id}", response_model=ApplicationOut)
def update_application(
    app_id: str, body: ApplicationUpdate, db: Session = Depends(get_db)
):
    app_ = db.get(Application, app_id)
    if not app_:
        raise HTTPException(404, "Application not found")
    if body.name is not None:
        app_.name = body.name
    if body.provider is not None:
        app_.provider = body.provider
    if body.region_id is not None:
        region = db.get(Region, body.region_id)
        if not region:
            raise HTTPException(400, "Invalid region_id")
        app_.region_id = body.region_id
    db.commit()
    # Reload with full relationships after commit
    app_ = (
        db.scalars(
            select(Application)
            .where(Application.id == app_id)
            .options(
                joinedload(Application.region),
                joinedload(Application.services)
                .joinedload(AppService.instance_type)
                .joinedload(InstanceType.service_category),
            )
        )
        .unique()
        .first()
    )
    return _build_app_out(app_, db)


@router.delete("/applications/{app_id}", status_code=204)
def delete_application(app_id: str, db: Session = Depends(get_db)):
    app_ = db.get(Application, app_id)
    if not app_:
        raise HTTPException(404, "Application not found")
    db.delete(app_)
    db.commit()


# ─── Services ─────────────────────────────────────────────────────────────────


@router.post(
    "/applications/{app_id}/services",
    response_model=AppServiceOut,
    status_code=201,
)
def create_service(app_id: str, body: AppServiceCreate, db: Session = Depends(get_db)):
    app_ = (
        db.scalars(
            select(Application)
            .where(Application.id == app_id)
            .options(joinedload(Application.region))
        )
        .unique()
        .first()
    )
    if not app_:
        raise HTTPException(404, "Application not found")

    it = db.get(InstanceType, body.instance_type_id)
    if not it:
        raise HTTPException(400, "Invalid instance_type_id")

    svc = AppService(
        application_id=app_id,
        instance_type_id=body.instance_type_id,
        utilization_rate=body.utilization_rate,
        reserved=body.reserved,
        reserved_term=body.reserved_term,
        volume_gb=body.volume_gb,
        monthly_requests=body.monthly_requests,
        avg_duration_ms=body.avg_duration_ms,
        memory_mb=body.memory_mb,
        node_count=body.node_count,
        deployment_option=body.deployment_option,
    )
    db.add(svc)
    db.commit()
    db.refresh(svc)
    svc.instance_type = it

    pricing = db.scalars(
        select(Pricing).where(
            Pricing.instance_type_id == svc.instance_type_id,
            Pricing.region_id == app_.region_id,
        )
    ).first()
    return _build_service_out(svc, pricing)


@router.put("/services/{service_id}", response_model=AppServiceOut)
def update_service(
    service_id: str, body: AppServiceUpdate, db: Session = Depends(get_db)
):
    svc = (
        db.scalars(
            select(AppService)
            .where(AppService.id == service_id)
            .options(
                joinedload(AppService.instance_type).joinedload(InstanceType.service_category),
                joinedload(AppService.application).joinedload(Application.region),
            )
        )
        .unique()
        .first()
    )
    if not svc:
        raise HTTPException(404, "Service not found")

    if body.instance_type_id is not None:
        it = db.get(InstanceType, body.instance_type_id)
        if not it:
            raise HTTPException(400, "Invalid instance_type_id")
        svc.instance_type_id = body.instance_type_id
        svc.instance_type = it

    if body.utilization_rate is not None:
        svc.utilization_rate = body.utilization_rate
    if body.reserved is not None:
        svc.reserved = body.reserved
    if body.reserved_term is not None:
        svc.reserved_term = body.reserved_term
    if body.volume_gb is not None:
        svc.volume_gb = body.volume_gb
    if body.monthly_requests is not None:
        svc.monthly_requests = body.monthly_requests
    if body.avg_duration_ms is not None:
        svc.avg_duration_ms = body.avg_duration_ms
    if body.memory_mb is not None:
        svc.memory_mb = body.memory_mb
    if body.node_count is not None:
        svc.node_count = body.node_count
    if body.deployment_option is not None:
        svc.deployment_option = body.deployment_option

    db.commit()
    db.refresh(svc)

    region_id = svc.application.region_id
    pricing = db.scalars(
        select(Pricing).where(
            Pricing.instance_type_id == svc.instance_type_id,
            Pricing.region_id == region_id,
        )
    ).first()
    return _build_service_out(svc, pricing)


@router.delete("/services/{service_id}", status_code=204)
def delete_service(service_id: str, db: Session = Depends(get_db)):
    svc = db.get(AppService, service_id)
    if not svc:
        raise HTTPException(404, "Service not found")
    db.delete(svc)
    db.commit()
