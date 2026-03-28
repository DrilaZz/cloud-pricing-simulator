"""GCP pricing scraper.

For now reads from a local mock JSON file (gcp_mock_data.json).
The real implementation would use the GCP Cloud Billing Catalog API
which requires an API key / service account.
"""

import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InstanceType, Pricing, Provider, Region, ServiceCategory
from app.scrapers.base import BaseScraper

_MOCK_FILE = Path(__file__).parent / "gcp_mock_data.json"


class GCPScraper(BaseScraper):
    def __init__(self, db: Session):
        super().__init__(db)
        self._provider: Provider | None = None

    def _get_provider(self) -> Provider:
        if self._provider is None:
            self._provider = self.db.scalars(
                select(Provider).where(Provider.name == "gcp")
            ).one()
        return self._provider

    def fetch_data(self) -> list[dict]:
        print(f"  [GCP] Reading mock data from {_MOCK_FILE.name}")
        with open(_MOCK_FILE) as f:
            return json.load(f)

    def normalize_data(self, raw: list[dict]) -> list[dict]:
        records: list[dict] = []

        for entry in raw:
            ri_1y = entry.get("ri_discount_1y", 0.25)
            ri_3y = entry.get("ri_discount_3y", 0.40)
            pricing_unit = entry.get("pricing_unit", "per_hour")
            storage_tier = entry.get("storage_tier")

            for region_code, price_usd in entry.get("regions", {}).items():
                # Non-hourly services don't have RI pricing
                if ri_1y and ri_1y > 0:
                    reserved_1y = round(price_usd * (1 - ri_1y), 6)
                    reserved_3y = round(price_usd * (1 - ri_3y), 6)
                else:
                    reserved_1y = None
                    reserved_3y = None

                records.append({
                    "instance_name":             entry["instance_name"],
                    "service_category":          entry["service_category"],
                    "vcpus":                     entry.get("vcpus"),
                    "memory_gb":                 entry.get("memory_gb"),
                    "storage_info":              entry.get("storage_info"),
                    "equivalent_group":          entry.get("equivalent_group"),
                    "region_code":               region_code,
                    "price_per_hour_ondemand":   price_usd,
                    "price_per_hour_reserved_1y": reserved_1y,
                    "price_per_hour_reserved_3y": reserved_3y,
                    "currency":                  "USD",
                    "pricing_unit":              pricing_unit,
                    "storage_tier":              storage_tier,
                })

        return records

    def save_to_db(self, records: list[dict]) -> int:
        provider = self._get_provider()
        count = 0

        for rec in records:
            region = self.db.scalars(
                select(Region).where(
                    Region.provider_id == provider.id,
                    Region.code == rec["region_code"],
                )
            ).first()
            if not region:
                continue

            cat = self.db.scalars(
                select(ServiceCategory).where(
                    ServiceCategory.name == rec["service_category"]
                )
            ).first()
            if not cat:
                continue

            it = self.db.scalars(
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
                self.db.add(it)
                self.db.flush()
            else:
                it.vcpus = rec.get("vcpus")
                it.memory_gb = rec.get("memory_gb")
                it.equivalent_group = rec.get("equivalent_group")
                it.pricing_unit = rec.get("pricing_unit", "per_hour")
                it.storage_tier = rec.get("storage_tier")

            pricing = self.db.scalars(
                select(Pricing).where(
                    Pricing.instance_type_id == it.id,
                    Pricing.region_id == region.id,
                )
            ).first()
            if not pricing:
                pricing = Pricing(instance_type_id=it.id, region_id=region.id)
                self.db.add(pricing)

            pricing.price_per_hour_ondemand = rec["price_per_hour_ondemand"]
            pricing.price_per_hour_reserved_1y = rec.get("price_per_hour_reserved_1y")
            pricing.price_per_hour_reserved_3y = rec.get("price_per_hour_reserved_3y")
            pricing.currency = rec["currency"]
            pricing.last_updated = datetime.utcnow()
            count += 1

        self.db.commit()
        return count
