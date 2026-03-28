from datetime import datetime

from pydantic import BaseModel


# ─── Provider ──────────────────────────────────────────────────────────────────

class ProviderOut(BaseModel):
    id: int
    name: str
    display_name: str

    model_config = {"from_attributes": True}


# ─── Region ────────────────────────────────────────────────────────────────────

class RegionOut(BaseModel):
    id: int
    provider_id: int
    code: str
    display_name: str

    model_config = {"from_attributes": True}


# ─── Service Category ─────────────────────────────────────────────────────────

class ServiceCategoryOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


# ─── Instance Type ─────────────────────────────────────────────────────────────

class InstanceTypeOut(BaseModel):
    id: int
    provider_id: int
    service_category_id: int
    name: str
    vcpus: int | None = None
    memory_gb: float | None = None
    storage_info: str | None = None
    equivalent_group: str | None = None
    pricing_unit: str | None = None
    storage_tier: str | None = None

    model_config = {"from_attributes": True}


# ─── Pricing ───────────────────────────────────────────────────────────────────

class PricingOut(BaseModel):
    id: int
    instance_type_id: int
    region_id: int
    price_per_hour_ondemand: float
    price_per_hour_reserved_1y: float | None = None
    price_per_hour_reserved_3y: float | None = None
    currency: str
    last_updated: datetime

    model_config = {"from_attributes": True}


class PricingDetailOut(BaseModel):
    """Pricing joined with instance type + region info for comparison views."""

    instance_type: InstanceTypeOut
    region: RegionOut
    provider: ProviderOut
    price_per_hour_ondemand: float
    price_per_hour_reserved_1y: float | None = None
    price_per_hour_reserved_3y: float | None = None
    currency: str
    last_updated: datetime


# ─── Multi-cloud comparison ────────────────────────────────────────────────────

class CompareServiceInput(BaseModel):
    service_id: str
    instance_type_id: int
    region_id: int
    utilization_rate: float = 1.0
    reserved: bool = False
    reserved_term: str | None = None
    # category-specific params for cost calculation
    pricing_unit: str | None = None
    volume_gb: float | None = None
    monthly_requests: int | None = None
    avg_duration_ms: float | None = None
    memory_mb: int | None = None
    node_count: int | None = None


class CompareAppRequest(BaseModel):
    services: list[CompareServiceInput]


class ServiceEquivalentOut(BaseModel):
    instance_name: str
    region_code: str
    region_display_name: str
    price_per_hour_ondemand: float
    price_per_hour_reserved_1y: float | None
    price_per_hour_reserved_3y: float | None
    monthly_cost_ondemand: float
    monthly_cost_effective: float


class ServiceComparisonOut(BaseModel):
    service_id: str
    original_instance: str
    original_monthly_cost: float
    equivalent_group: str | None
    # provider name → equivalent (None = no equivalent found)
    equivalents: dict[str, ServiceEquivalentOut | None]


class ProviderTotalsOut(BaseModel):
    total_monthly_ondemand: float
    total_monthly_effective: float
    mapped_services: int
    total_services: int
    region_display_name: str


class CompareAppResponse(BaseModel):
    services: list[ServiceComparisonOut]
    provider_totals: dict[str, ProviderTotalsOut]
