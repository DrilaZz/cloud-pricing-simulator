import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Float, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AppService(Base):
    __tablename__ = "app_services"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    application_id: Mapped[str] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), nullable=False
    )
    instance_type_id: Mapped[int] = mapped_column(
        ForeignKey("instance_types.id"), nullable=False
    )
    utilization_rate: Mapped[float] = mapped_column(
        Numeric(5, 4), nullable=False, default=1.0
    )
    reserved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reserved_term: Mapped[str | None] = mapped_column(
        String(5), nullable=True
    )  # "1y" or "3y"

    # Storage params
    volume_gb: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Serverless params
    monthly_requests: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    avg_duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    memory_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Containers params
    node_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Database params
    deployment_option: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # "single-az" or "multi-az"

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, nullable=False)

    application: Mapped["Application"] = relationship(back_populates="services")  # noqa: F821
    instance_type: Mapped["InstanceType"] = relationship()  # noqa: F821
