"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # providers
    op.create_table(
        "providers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(20), unique=True, nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
    )

    # service_categories
    op.create_table(
        "service_categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(50), unique=True, nullable=False),
    )

    # regions
    op.create_table(
        "regions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "provider_id",
            sa.Integer(),
            sa.ForeignKey("providers.id"),
            nullable=False,
        ),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
    )

    # instance_types
    op.create_table(
        "instance_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "provider_id",
            sa.Integer(),
            sa.ForeignKey("providers.id"),
            nullable=False,
        ),
        sa.Column(
            "service_category_id",
            sa.Integer(),
            sa.ForeignKey("service_categories.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("vcpus", sa.Integer(), nullable=True),
        sa.Column("memory_gb", sa.Numeric(10, 2), nullable=True),
        sa.Column("storage_info", sa.String(200), nullable=True),
        sa.Column("equivalent_group", sa.String(100), nullable=True),
    )
    op.create_index(
        "ix_instance_types_provider_category",
        "instance_types",
        ["provider_id", "service_category_id"],
    )

    # pricing
    op.create_table(
        "pricing",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "instance_type_id",
            sa.Integer(),
            sa.ForeignKey("instance_types.id"),
            nullable=False,
        ),
        sa.Column(
            "region_id",
            sa.Integer(),
            sa.ForeignKey("regions.id"),
            nullable=False,
        ),
        sa.Column(
            "price_per_hour_ondemand", sa.Numeric(12, 6), nullable=False
        ),
        sa.Column(
            "price_per_hour_reserved_1y", sa.Numeric(12, 6), nullable=True
        ),
        sa.Column(
            "price_per_hour_reserved_3y", sa.Numeric(12, 6), nullable=True
        ),
        sa.Column("currency", sa.String(10), nullable=False, server_default="USD"),
        sa.Column(
            "last_updated",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "instance_type_id", "region_id", name="uq_pricing_instance_region"
        ),
    )
    op.create_index(
        "ix_pricing_instance_region",
        "pricing",
        ["instance_type_id", "region_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_pricing_instance_region", table_name="pricing")
    op.drop_table("pricing")
    op.drop_index(
        "ix_instance_types_provider_category", table_name="instance_types"
    )
    op.drop_table("instance_types")
    op.drop_table("regions")
    op.drop_table("service_categories")
    op.drop_table("providers")
