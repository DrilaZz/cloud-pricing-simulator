from datetime import datetime

from sqlalchemy import ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Pricing(Base):
    __tablename__ = "pricing"
    __table_args__ = (
        UniqueConstraint("instance_type_id", "region_id", name="uq_pricing_instance_region"),
        Index("ix_pricing_instance_region", "instance_type_id", "region_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    instance_type_id: Mapped[int] = mapped_column(
        ForeignKey("instance_types.id"), nullable=False
    )
    region_id: Mapped[int] = mapped_column(ForeignKey("regions.id"), nullable=False)
    price_per_hour_ondemand: Mapped[float] = mapped_column(
        Numeric(20, 10), nullable=False
    )
    price_per_hour_reserved_1y: Mapped[float | None] = mapped_column(
        Numeric(20, 10), nullable=True
    )
    price_per_hour_reserved_3y: Mapped[float | None] = mapped_column(
        Numeric(20, 10), nullable=True
    )
    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    last_updated: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    instance_type: Mapped["InstanceType"] = relationship(back_populates="pricing_entries")  # noqa: F821
    region: Mapped["Region"] = relationship(back_populates="pricing_entries")  # noqa: F821
