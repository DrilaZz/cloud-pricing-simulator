"""Add category-specific parameters to app_services

Revision ID: 004
Revises: 003
Create Date: 2026-03-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("app_services", sa.Column("volume_gb", sa.Float(), nullable=True))
    op.add_column("app_services", sa.Column("monthly_requests", sa.BigInteger(), nullable=True))
    op.add_column("app_services", sa.Column("avg_duration_ms", sa.Float(), nullable=True))
    op.add_column("app_services", sa.Column("memory_mb", sa.Integer(), nullable=True))
    op.add_column("app_services", sa.Column("node_count", sa.Integer(), nullable=True))
    op.add_column("app_services", sa.Column("deployment_option", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("app_services", "deployment_option")
    op.drop_column("app_services", "node_count")
    op.drop_column("app_services", "memory_mb")
    op.drop_column("app_services", "avg_duration_ms")
    op.drop_column("app_services", "monthly_requests")
    op.drop_column("app_services", "volume_gb")
