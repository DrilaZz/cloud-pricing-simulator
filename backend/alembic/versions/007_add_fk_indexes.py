"""Add indexes on FK columns for applications and app_services

Revision ID: 007
Revises: 006
Create Date: 2026-03-28

Rationale: Without indexes on FK columns, JOINs and cascade deletes on
applications.project_id, applications.region_id, app_services.application_id,
and app_services.instance_type_id require full table scans.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_applications_project_id", "applications", ["project_id"])
    op.create_index("ix_applications_region_id", "applications", ["region_id"])
    op.create_index("ix_app_services_application_id", "app_services", ["application_id"])
    op.create_index("ix_app_services_instance_type_id", "app_services", ["instance_type_id"])


def downgrade() -> None:
    op.drop_index("ix_app_services_instance_type_id", table_name="app_services")
    op.drop_index("ix_app_services_application_id", table_name="app_services")
    op.drop_index("ix_applications_region_id", table_name="applications")
    op.drop_index("ix_applications_project_id", table_name="applications")
