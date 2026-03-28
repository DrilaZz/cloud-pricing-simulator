"""Add pricing_unit and storage_tier to instance_types

Revision ID: 003
Revises: 002
Create Date: 2026-03-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "instance_types",
        sa.Column("pricing_unit", sa.String(30), nullable=True),
    )
    op.add_column(
        "instance_types",
        sa.Column("storage_tier", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("instance_types", "storage_tier")
    op.drop_column("instance_types", "pricing_unit")
