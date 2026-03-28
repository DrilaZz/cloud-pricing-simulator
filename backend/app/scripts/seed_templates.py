"""seed_templates.py

Seeds the default architecture templates into the custom_templates table.
Safe to call multiple times — skips if templates already exist.

Run manually:
    cd backend && python -m app.scripts.seed_templates

Or called automatically on server startup.
"""

import json
import sys
import uuid
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import select

from app.database import SessionLocal
from app.models.custom_template import CustomTemplate
from app.data.default_templates import DEFAULT_TEMPLATES


def seed_default_templates() -> None:
    db = SessionLocal()
    try:
        existing_count = db.scalar(
            select(CustomTemplate).where(CustomTemplate.is_default == True).limit(1)  # noqa: E712
        )
        if existing_count is not None:
            return  # already seeded

        now = datetime.utcnow()
        for tpl in DEFAULT_TEMPLATES:
            t = CustomTemplate(
                id=str(uuid.uuid4()),
                name=tpl["name"],
                description=tpl.get("description"),
                is_default=True,
                services_json=json.dumps(tpl["services"]),
                created_at=now,
                updated_at=now,
            )
            db.add(t)
        db.commit()
        print(f"[seed_templates] Seeded {len(DEFAULT_TEMPLATES)} default templates.")
    finally:
        db.close()


if __name__ == "__main__":
    seed_default_templates()
