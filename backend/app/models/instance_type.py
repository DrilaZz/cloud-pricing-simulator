from sqlalchemy import ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InstanceType(Base):
    __tablename__ = "instance_types"
    __table_args__ = (
        Index("ix_instance_types_provider_category", "provider_id", "service_category_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id"), nullable=False)
    service_category_id: Mapped[int] = mapped_column(
        ForeignKey("service_categories.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    vcpus: Mapped[int | None] = mapped_column(nullable=True)
    memory_gb: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    storage_info: Mapped[str | None] = mapped_column(String(200), nullable=True)
    equivalent_group: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # per_hour | per_gb_month | per_request | per_gb_second | per_cluster_hour | per_vcpu_hour | per_gb_hour
    pricing_unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # standard | intelligent-tiering | glacier | hot | cool | archive | nearline | coldline | …
    storage_tier: Mapped[str | None] = mapped_column(String(50), nullable=True)

    provider: Mapped["Provider"] = relationship(back_populates="instance_types")  # noqa: F821
    service_category: Mapped["ServiceCategory"] = relationship(back_populates="instance_types")  # noqa: F821
    pricing_entries: Mapped[list["Pricing"]] = relationship(back_populates="instance_type")  # noqa: F821
