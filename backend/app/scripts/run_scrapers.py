"""Load committed pricing JSON files into the database.

These JSON files are generated locally by:
    python -m app.scripts.generate_pricing_json

and committed to the repo. This script loads them at Docker startup — fast
(2–3 seconds) with no network requests.
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import InstanceType, Pricing, Provider, Region, ServiceCategory
from app.models.pricing import Pricing as PricingModel
from app.scripts.update_equivalent_groups import main as update_groups

DATA_DIR = Path(__file__).parent.parent / "data" / "pricing"

PROVIDER_FILES = {
    "aws":   DATA_DIR / "aws_pricing.json",
    "azure": DATA_DIR / "azure_pricing.json",
    "gcp":   DATA_DIR / "gcp_pricing.json",
}


def _load_provider(db: Session, provider_name: str, path: Path) -> int:
    if not path.exists():
        print(f"  WARN: {path} not found — skipping {provider_name}")
        return 0

    provider = db.scalars(select(Provider).where(Provider.name == provider_name)).first()
    if not provider:
        print(f"  ERROR: provider '{provider_name}' not in DB — run seed_providers first")
        return 0

    with open(path) as f:
        data = json.load(f)
    # Support both plain list (legacy) and {"generated_at": ..., "records": [...]}
    records: list[dict] = data["records"] if isinstance(data, dict) else data

    print(f"  Loading {len(records)} records for {provider_name}…", flush=True)
    count = 0
    now = datetime.utcnow()

    for rec in records:
        region = db.scalars(
            select(Region).where(
                Region.provider_id == provider.id,
                Region.code == rec["region_code"],
            )
        ).first()
        if not region:
            continue

        cat = db.scalars(
            select(ServiceCategory).where(
                ServiceCategory.name == rec["service_category"]
            )
        ).first()
        if not cat:
            continue

        it = db.scalars(
            select(InstanceType).where(
                InstanceType.provider_id == provider.id,
                InstanceType.name == rec["instance_name"],
            )
        ).first()
        if not it:
            it = InstanceType(
                provider_id=provider.id,
                service_category_id=cat.id,
                name=rec["instance_name"],
                vcpus=rec.get("vcpus"),
                memory_gb=rec.get("memory_gb"),
                storage_info=rec.get("storage_info"),
                equivalent_group=rec.get("equivalent_group"),
                pricing_unit=rec.get("pricing_unit", "per_hour"),
                storage_tier=rec.get("storage_tier"),
            )
            db.add(it)
            db.flush()
        else:
            it.vcpus = rec.get("vcpus")
            it.memory_gb = rec.get("memory_gb")
            it.storage_info = rec.get("storage_info")
            it.equivalent_group = rec.get("equivalent_group")
            it.pricing_unit = rec.get("pricing_unit", "per_hour")
            it.storage_tier = rec.get("storage_tier")

        pricing = db.scalars(
            select(Pricing).where(
                Pricing.instance_type_id == it.id,
                Pricing.region_id == region.id,
            )
        ).first()
        if not pricing:
            pricing = Pricing(instance_type_id=it.id, region_id=region.id)
            db.add(pricing)

        pricing.price_per_hour_ondemand = rec["price_per_hour_ondemand"]
        pricing.price_per_hour_reserved_1y = rec.get("price_per_hour_reserved_1y")
        pricing.price_per_hour_reserved_3y = rec.get("price_per_hour_reserved_3y")
        pricing.currency = rec.get("currency", "USD")
        pricing.last_updated = now
        count += 1

    db.commit()
    return count


def run() -> None:
    db = SessionLocal()
    try:
        total = 0
        for provider_name, path in PROVIDER_FILES.items():
            print(f"\n{'='*50}")
            print(f"Loading {provider_name.upper()} pricing from {path.name}…")
            print(f"{'='*50}")
            start = time.time()
            count = _load_provider(db, provider_name, path)
            elapsed = time.time() - start
            print(f"  {provider_name.upper()}: {count} pricing records ({elapsed:.1f}s)")
            total += count

        print(f"\n{'='*50}")
        print("Updating equivalent_group mappings…")
        print(f"{'='*50}")
        update_groups()

        print(f"\n{'='*50}")
        print(f"All providers loaded. Total: {total} records.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load pricing JSON files into the database.")
    parser.add_argument(
        "--skip-if-exists",
        action="store_true",
        help="Skip loading if pricing data already exists in the database.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force re-loading even when data exists (overrides --skip-if-exists).",
    )
    args = parser.parse_args()

    if args.skip_if_exists and not args.force:
        db = SessionLocal()
        try:
            existing = db.scalar(select(func.count()).select_from(PricingModel))
        finally:
            db.close()
        if existing and existing > 0:
            print(
                f"Pricing data already exists ({existing} records), skipping load. "
                "Use --force to reload."
            )
            sys.exit(0)

    run()
