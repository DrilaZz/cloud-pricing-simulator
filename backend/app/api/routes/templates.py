import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.custom_template import CustomTemplate
from app.schemas.templates import TemplateCreate, TemplateOut, TemplateUpdate

router = APIRouter(prefix="/api/templates", tags=["templates"])


def _to_out(t: CustomTemplate) -> TemplateOut:
    return TemplateOut.from_orm(t)


@router.get("", response_model=list[TemplateOut])
def list_templates(db: Session = Depends(get_db)):
    templates = db.scalars(
        select(CustomTemplate).order_by(
            CustomTemplate.is_default.desc(),
            CustomTemplate.created_at.asc(),
        )
    ).all()
    return [_to_out(t) for t in templates]


@router.post("", response_model=TemplateOut, status_code=201)
def create_template(body: TemplateCreate, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    t = CustomTemplate(
        name=body.name,
        description=body.description,
        is_default=False,
        services_json=json.dumps([s.model_dump() for s in body.services]),
        created_at=now,
        updated_at=now,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _to_out(t)


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: str, body: TemplateUpdate, db: Session = Depends(get_db)
):
    t = db.get(CustomTemplate, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.is_default:
        raise HTTPException(400, "Cannot modify default templates")
    if body.name is not None:
        t.name = body.name
    if body.description is not None:
        t.description = body.description
    if body.services is not None:
        t.services_json = json.dumps([s.model_dump() for s in body.services])
    t.updated_at = datetime.utcnow()
    db.commit()
    return _to_out(t)


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: str, db: Session = Depends(get_db)):
    t = db.get(CustomTemplate, template_id)
    if not t:
        raise HTTPException(404, "Template not found")
    if t.is_default:
        raise HTTPException(400, "Cannot delete default templates")
    db.delete(t)
    db.commit()
