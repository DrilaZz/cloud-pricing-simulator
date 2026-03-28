import json
import logging
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import InstanceType, Pricing, Provider, Region, ServiceCategory

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

_DATA_DIR = Path(__file__).parent.parent.parent / "data" / "pricing"
_PROVIDER_FILES = ["aws_pricing.json", "azure_pricing.json", "gcp_pricing.json"]


@lru_cache(maxsize=1)
def _read_pricing_data_date() -> str | None:
    """Return the most recent generated_at timestamp across all JSON files.
    Cached for the process lifetime — the JSON files only change on redeploy.
    """
    latest: str | None = None
    for fname in _PROVIDER_FILES:
        path = _DATA_DIR / fname
        if not path.exists():
            continue
        try:
            with open(path) as f:
                data = json.load(f)
            ts = data.get("generated_at") if isinstance(data, dict) else None
            if ts and (latest is None or ts > latest):
                latest = ts
        except Exception:
            logger.warning("Could not read pricing date from %s", path, exc_info=True)
    return latest


# ─── Response schemas ─────────────────────────────────────────────────────────


class ProviderStatusSummary(BaseModel):
    complete: int
    partial: int
    empty: int


class RegionStatusOut(BaseModel):
    region_id: int
    provider_name: str
    region_code: str
    region_display_name: str
    total_instance_types: int
    last_updated: str | None
    status: str  # "complete" | "partial" | "empty"
    breakdown: dict[str, int]


class DataStatusOut(BaseModel):
    total_prices: int
    pricing_data_date: str | None
    data_source: str
    providers_status: dict[str, ProviderStatusSummary]
    regions: list[RegionStatusOut]


# ─── Endpoint ─────────────────────────────────────────────────────────────────


@router.get("/data-status", response_model=DataStatusOut)
def get_data_status(db: Session = Depends(get_db)):
    # ── Global counts ──────────────────────────────────────────────────────────
    total_prices = db.scalar(select(func.count()).select_from(Pricing)) or 0

    # ── Pricing data date from JSON files ──────────────────────────────────────
    pricing_data_date = _read_pricing_data_date()

    # ── Providers ─────────────────────────────────────────────────────────────
    providers_list = db.scalars(select(Provider).order_by(Provider.name)).all()
    providers_by_id = {p.id: p for p in providers_list}

    # ── Regions ───────────────────────────────────────────────────────────────
    all_regions = db.scalars(
        select(Region).order_by(Region.provider_id, Region.code)
    ).all()

    # ── Per-region per-category stats ─────────────────────────────────────────
    rows = db.execute(
        select(
            Pricing.region_id,
            ServiceCategory.name.label("cat"),
            func.count(Pricing.id).label("cnt"),
            func.max(Pricing.last_updated).label("last_up"),
        )
        .join(Pricing.instance_type)
        .join(InstanceType.service_category)
        .group_by(Pricing.region_id, ServiceCategory.name)
    ).all()

    region_stats: dict[int, dict] = {}
    for row in rows:
        if row.region_id not in region_stats:
            region_stats[row.region_id] = {"cats": {}, "last_updated": None}
        region_stats[row.region_id]["cats"][row.cat] = row.cnt
        if row.last_up:
            prev = region_stats[row.region_id]["last_updated"]
            if prev is None or row.last_up > prev:
                region_stats[row.region_id]["last_updated"] = row.last_up

    # ── Per-provider summary ──────────────────────────────────────────────────
    providers_status: dict[str, dict[str, int]] = {
        p.name: {"complete": 0, "partial": 0, "empty": 0}
        for p in providers_list
    }

    regions_out: list[RegionStatusOut] = []
    for region in all_regions:
        provider = providers_by_id.get(region.provider_id)
        if not provider:
            continue

        stats = region_stats.get(region.id, {"cats": {}, "last_updated": None})
        breakdown: dict[str, int] = stats["cats"]
        total = sum(breakdown.values())
        last_up = stats["last_updated"]

        # "complete" = all 5 expected categories present, "partial" = some, "empty" = none
        expected_cats = {"compute", "database", "storage", "serverless", "containers"}
        covered_cats = set(breakdown.keys())
        if total == 0:
            status = "empty"
        elif expected_cats <= covered_cats:
            status = "complete"
        else:
            status = "partial"

        providers_status[provider.name][status] += 1

        regions_out.append(RegionStatusOut(
            region_id=region.id,
            provider_name=provider.name,
            region_code=region.code,
            region_display_name=region.display_name,
            total_instance_types=total,
            last_updated=last_up.isoformat() if last_up else None,
            status=status,
            breakdown=breakdown,
        ))

    return DataStatusOut(
        total_prices=total_prices,
        pricing_data_date=pricing_data_date,
        data_source="static",
        providers_status={
            name: ProviderStatusSummary(**counts)
            for name, counts in providers_status.items()
        },
        regions=regions_out,
    )
