"""projects, applications, and services tables

Revision ID: 002
Revises: 001
Create Date: 2026-03-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    op.create_table(
        "applications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column(
            "region_id",
            sa.Integer(),
            sa.ForeignKey("regions.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_applications_project_id", "applications", ["project_id"]
    )

    op.create_table(
        "app_services",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "application_id",
            sa.String(36),
            sa.ForeignKey("applications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "instance_type_id",
            sa.Integer(),
            sa.ForeignKey("instance_types.id"),
            nullable=False,
        ),
        sa.Column(
            "utilization_rate",
            sa.Numeric(5, 4),
            nullable=False,
            server_default="1.0",
        ),
        sa.Column(
            "reserved", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column("reserved_term", sa.String(5), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_app_services_application_id", "app_services", ["application_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_app_services_application_id", table_name="app_services")
    op.drop_table("app_services")
    op.drop_index("ix_applications_project_id", table_name="applications")
    op.drop_table("applications")
    op.drop_table("projects")
