import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TemplateServiceSpec(BaseModel):
    equivalent_group: str
    label: str = ""
    utilization_rate: float = 1.0
    reserved: bool = False
    reserved_term: str | None = None
    volume_gb: float | None = None
    monthly_requests: int | None = None
    avg_duration_ms: float | None = None
    memory_mb: int | None = None
    node_count: int | None = None
    deployment_option: str | None = None


class TemplateOut(BaseModel):
    id: str
    name: str
    description: str | None
    is_default: bool
    services: list[TemplateServiceSpec]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm(cls, obj: Any) -> "TemplateOut":
        services_raw = json.loads(obj.services_json or "[]")
        return cls(
            id=obj.id,
            name=obj.name,
            description=obj.description,
            is_default=obj.is_default,
            services=[TemplateServiceSpec(**s) for s in services_raw],
            created_at=obj.created_at,
            updated_at=obj.updated_at,
        )


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    services: list[TemplateServiceSpec]


class TemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    services: list[TemplateServiceSpec] | None = None
