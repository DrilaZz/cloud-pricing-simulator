from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.pricing import InstanceTypeOut, RegionOut


# ─── AppService ───────────────────────────────────────────────────────────────


class AppServiceCreate(BaseModel):
    instance_type_id: int
    utilization_rate: float = Field(ge=0, le=1, default=1.0)
    reserved: bool = False
    reserved_term: str | None = Field(None, pattern=r"^(1y|3y)$")
    # Storage
    volume_gb: float | None = None
    # Serverless
    monthly_requests: int | None = None
    avg_duration_ms: float | None = None
    memory_mb: int | None = None
    # Containers
    node_count: int | None = None
    # Database
    deployment_option: str | None = None


class AppServiceUpdate(BaseModel):
    instance_type_id: int | None = None
    utilization_rate: float | None = Field(None, ge=0, le=1)
    reserved: bool | None = None
    reserved_term: str | None = Field(None, pattern=r"^(1y|3y)$")
    # Storage
    volume_gb: float | None = None
    # Serverless
    monthly_requests: int | None = None
    avg_duration_ms: float | None = None
    memory_mb: int | None = None
    # Containers
    node_count: int | None = None
    # Database
    deployment_option: str | None = None


class AppServiceOut(BaseModel):
    id: str
    application_id: str
    instance_type_id: int
    utilization_rate: float
    reserved: bool
    reserved_term: str | None
    created_at: datetime
    # Category-specific params
    volume_gb: float | None = None
    monthly_requests: int | None = None
    avg_duration_ms: float | None = None
    memory_mb: int | None = None
    node_count: int | None = None
    deployment_option: str | None = None
    # Joined data
    instance_type: InstanceTypeOut
    service_category_name: str | None = None
    # Pricing for this service (in the application's region)
    price_per_hour_ondemand: float | None = None
    price_per_hour_reserved_1y: float | None = None
    price_per_hour_reserved_3y: float | None = None

    model_config = {"from_attributes": True}


# ─── Application ──────────────────────────────────────────────────────────────


class ApplicationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    provider: str = Field(pattern=r"^(aws|azure|gcp)$")
    region_id: int


class ApplicationFromTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    provider: str = Field(pattern=r"^(aws|azure|gcp)$")
    region_id: int
    template_id: str


class ApplicationUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    provider: str | None = Field(None, pattern=r"^(aws|azure|gcp)$")
    region_id: int | None = None


class ApplicationOut(BaseModel):
    id: str
    project_id: str
    name: str
    provider: str
    region_id: int
    region: RegionOut
    created_at: datetime
    updated_at: datetime
    services: list[AppServiceOut] = []
    monthly_cost: float = 0.0

    model_config = {"from_attributes": True}


# ─── Project ──────────────────────────────────────────────────────────────────


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    applications: list[ApplicationOut] = []
    monthly_cost: float = 0.0

    model_config = {"from_attributes": True}


class ProjectListOut(BaseModel):
    """Lighter version for the list endpoint."""

    id: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    application_count: int = 0
    monthly_cost: float = 0.0
    providers: list[str] = []

    model_config = {"from_attributes": True}
