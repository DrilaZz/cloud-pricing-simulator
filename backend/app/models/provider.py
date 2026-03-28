from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Provider(Base):
    __tablename__ = "providers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)

    regions: Mapped[list["Region"]] = relationship(back_populates="provider")  # noqa: F821
    instance_types: Mapped[list["InstanceType"]] = relationship(back_populates="provider")  # noqa: F821
