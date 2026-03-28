"""Increase pricing column precision to Numeric(20, 10)

Revision ID: 006
Revises: 005
Create Date: 2026-03-26

Rationale: Lambda per-request price is 2e-7 = 0.0000002 which requires
10 decimal places. The previous Numeric(12, 6) silently truncated it to 0.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("pricing") as batch_op:
        batch_op.alter_column(
            "price_per_hour_ondemand",
            type_=sa.Numeric(20, 10),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "price_per_hour_reserved_1y",
            type_=sa.Numeric(20, 10),
            existing_nullable=True,
        )
        batch_op.alter_column(
            "price_per_hour_reserved_3y",
            type_=sa.Numeric(20, 10),
            existing_nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("pricing") as batch_op:
        batch_op.alter_column(
            "price_per_hour_ondemand",
            type_=sa.Numeric(12, 6),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "price_per_hour_reserved_1y",
            type_=sa.Numeric(12, 6),
            existing_nullable=True,
        )
        batch_op.alter_column(
            "price_per_hour_reserved_3y",
            type_=sa.Numeric(12, 6),
            existing_nullable=True,
        )
