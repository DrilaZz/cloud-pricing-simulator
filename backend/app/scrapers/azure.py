"""Azure pricing scraper.

Uses the public Azure Retail Prices REST API:
  https://prices.azure.com/api/retail/prices

No authentication required.
"""

from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InstanceType, Pricing, Provider, Region, ServiceCategory
from app.scrapers.base import BaseScraper

# All 12 Azure regions to scrape
TARGET_REGIONS = {
    "eastus":         "East US",
    "eastus2":        "East US 2",
    "westus2":        "West US 2",
    "westus3":        "West US 3",
    "westeurope":     "West Europe",
    "northeurope":    "North Europe",
    "uksouth":        "UK South",
    "francecentral":  "France Central",
    "southeastasia":  "Southeast Asia",
    "australiaeast":  "Australia East",
    "japaneast":      "Japan East",
    "centralindia":   "Central India",
}

# VM series prefixes to keep (Bs, Dsv5, Esv5, Fsv2, Bsv2 + original series)
_VM_SERIES = {
    "Standard_B2",
    "Standard_B4",
    "Standard_B8",
    "Standard_D2s",
    "Standard_D4s",
    "Standard_D8s",
    "Standard_D16s",
    "Standard_D2as",
    "Standard_D4as",
    "Standard_D8as",
    "Standard_E4s",
    "Standard_E8s",
    "Standard_E16s",
    "Standard_E4as",
    "Standard_E8as",
    "Standard_F2s",
    "Standard_F4s",
    "Standard_F8s",
}

# Approximate RI discount percentages (Azure 1y / 3y All Upfront)
_RI_DISCOUNT_1Y = 0.35
_RI_DISCOUNT_3Y = 0.52

# Equivalent group mapping (category, vcpus, memory_gb)
_EQUIV_MAP = {
    ("compute",  2,  4.0): "small-compute",
    ("compute",  2,  8.0): "medium-compute",
    ("compute",  4, 16.0): "large-compute",
    ("compute",  4, 32.0): "xlarge-memory",
    ("compute",  8, 32.0): "xlarge-compute",
    ("compute",  8, 64.0): "xxlarge-memory",
    ("compute", 16, 64.0): "2xlarge-compute",
    ("compute", 16,128.0): "2xlarge-memory",
    ("database", 2, 10.0): "small-database",
    ("database", 4, 20.0): "large-database",
    ("database", 8, 40.0): "xlarge-database",
    ("database",16, 81.0): "xxlarge-database",
}


# Blob storage fallback prices (per GB/month) by tier when API fails
_BLOB_FALLBACK: dict[str, dict[str, float]] = {
    "hot":     {"price": 0.018,  "pricing_unit": "per_gb_month", "storage_tier": "hot"},
    "cool":    {"price": 0.01,   "pricing_unit": "per_gb_month", "storage_tier": "cool"},
    "archive": {"price": 0.00099,"pricing_unit": "per_gb_month", "storage_tier": "archive"},
}

# Azure Functions fallback prices
_FUNCTIONS_FALLBACK = [
    {"name": "Azure-Functions-Invocations", "price": 0.0000002,  "pricing_unit": "per_request"},
    {"name": "Azure-Functions-Duration",    "price": 0.000016,   "pricing_unit": "per_gb_second"},
]

# AKS cluster management is free; we include one representative entry
_AKS_CLUSTER_PRICE = 0.10  # per cluster per hour (Uptime SLA tier)


def _equiv(cat: str, vcpus: int | None, mem: float | None) -> str | None:
    if vcpus is None or mem is None:
        return None
    return _EQUIV_MAP.get((cat, vcpus, mem))


class AzureScraper(BaseScraper):
    BASE_URL = "https://prices.azure.com/api/retail/prices"

    def __init__(self, db: Session):
        super().__init__(db)
        self._provider: Provider | None = None

    def _get_provider(self) -> Provider:
        if self._provider is None:
            self._provider = self.db.scalars(
                select(Provider).where(Provider.name == "azure")
            ).one()
        return self._provider

    def _fetch_page(self, odata_filter: str, client: httpx.Client) -> list[dict]:
        """Fetch all pages for a given OData filter."""
        items: list[dict] = []
        url: str | None = f"{self.BASE_URL}?$filter={odata_filter}"

        while url:
            resp = client.get(url, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            items.extend(data.get("Items", []))
            url = data.get("NextPageLink")
            if len(items) > 5000:
                break

        return items

    def fetch_data(self) -> list[dict]:
        entries: list[dict] = []

        with httpx.Client(timeout=60) as client:
            for region_code in TARGET_REGIONS:
                # ── Virtual Machines ────────────────────────────────────
                print(f"  [Azure] Fetching compute for {region_code}…")
                vm_filter = (
                    f"serviceName eq 'Virtual Machines' and "
                    f"armRegionName eq '{region_code}' and "
                    f"priceType eq 'Consumption' and "
                    f"contains(productName, 'Windows') eq false"
                )
                try:
                    vm_items = self._fetch_page(vm_filter, client)
                except Exception as exc:
                    print(f"  [Azure] WARN: VM fetch failed for {region_code}: {exc}")
                    vm_items = []

                for item in vm_items:
                    sku = item.get("armSkuName", "")
                    if not any(sku.startswith(s) for s in _VM_SERIES):
                        continue
                    if item.get("type") != "Consumption":
                        continue
                    unit = item.get("unitOfMeasure", "")
                    if "Hour" not in unit:
                        continue
                    price = item.get("retailPrice", 0)
                    if price <= 0:
                        continue

                    entries.append({
                        "instance_name":   sku,
                        "service_category": "compute",
                        "vcpus":           None,
                        "memory_gb":       None,
                        "storage_info":    None,
                        "region_code":     region_code,
                        "price_usd":       price,
                        "meter_name":      item.get("meterName", ""),
                        "pricing_unit":    "per_hour",
                        "storage_tier":    None,
                    })

                # ── SQL Database ────────────────────────────────────────
                print(f"  [Azure] Fetching SQL database for {region_code}…")
                sql_filter = (
                    f"serviceName eq 'SQL Database' and "
                    f"armRegionName eq '{region_code}' and "
                    f"priceType eq 'Consumption'"
                )
                try:
                    sql_items = self._fetch_page(sql_filter, client)
                except Exception as exc:
                    print(f"  [Azure] WARN: SQL fetch failed for {region_code}: {exc}")
                    sql_items = []

                for item in sql_items:
                    unit = item.get("unitOfMeasure", "")
                    if "Hour" not in unit:
                        continue
                    price = item.get("retailPrice", 0)
                    if price <= 0:
                        continue
                    sku = item.get("armSkuName", "") or item.get("skuName", "")
                    if not sku:
                        continue
                    product = item.get("productName", "")
                    if "vCore" not in product and "GP_Gen5" not in sku and "BC_Gen5" not in sku:
                        continue

                    entries.append({
                        "instance_name":   sku,
                        "service_category": "database",
                        "vcpus":           None,
                        "memory_gb":       None,
                        "storage_info":    None,
                        "region_code":     region_code,
                        "price_usd":       price,
                        "meter_name":      item.get("meterName", ""),
                        "pricing_unit":    "per_hour",
                        "storage_tier":    None,
                    })

                # ── Azure Database for MySQL / PostgreSQL ───────────────
                print(f"  [Azure] Fetching MySQL/PostgreSQL for {region_code}…")
                for db_service in ("Azure Database for MySQL", "Azure Database for PostgreSQL"):
                    db_filter = (
                        f"serviceName eq '{db_service}' and "
                        f"armRegionName eq '{region_code}' and "
                        f"priceType eq 'Consumption'"
                    )
                    try:
                        db_items = self._fetch_page(db_filter, client)
                    except Exception as exc:
                        print(f"  [Azure] WARN: {db_service} fetch failed for {region_code}: {exc}")
                        db_items = []

                    for item in db_items:
                        unit = item.get("unitOfMeasure", "")
                        if "Hour" not in unit:
                            continue
                        price = item.get("retailPrice", 0)
                        if price <= 0:
                            continue
                        sku = item.get("armSkuName", "") or item.get("skuName", "")
                        if not sku:
                            continue
                        product = item.get("productName", "")
                        # Keep General Purpose and Business Critical only
                        if "General Purpose" not in product and "Business Critical" not in product:
                            continue

                        short_name = "MySQL" if "MySQL" in db_service else "PostgreSQL"
                        entries.append({
                            "instance_name":   f"{short_name}-{sku}",
                            "service_category": "database",
                            "vcpus":           None,
                            "memory_gb":       None,
                            "storage_info":    None,
                            "region_code":     region_code,
                            "price_usd":       price,
                            "meter_name":      item.get("meterName", ""),
                            "pricing_unit":    "per_hour",
                            "storage_tier":    None,
                        })

                # ── Blob Storage ────────────────────────────────────────
                print(f"  [Azure] Fetching Blob Storage for {region_code}…")
                blob_filter = (
                    f"serviceName eq 'Storage' and "
                    f"armRegionName eq '{region_code}' and "
                    f"priceType eq 'Consumption'"
                )
                blob_added = False
                try:
                    blob_items = self._fetch_page(blob_filter, client)
                    for item in blob_items:
                        meter = item.get("meterName", "").lower()
                        sku_name = item.get("skuName", "").lower()
                        price = item.get("retailPrice", 0)
                        if price <= 0:
                            continue

                        # Target: LRS data storage meters for Hot/Cool/Archive
                        if "lrs" not in sku_name:
                            continue
                        if "data stored" not in meter and "blob storage" not in meter:
                            continue

                        if "hot" in sku_name or "hot" in meter:
                            tier = "hot"
                        elif "cool" in sku_name or "cool" in meter:
                            tier = "cool"
                        elif "archive" in sku_name or "archive" in meter:
                            tier = "archive"
                        else:
                            continue

                        entries.append({
                            "instance_name":   f"AzureBlob-{tier.capitalize()}-LRS",
                            "service_category": "storage",
                            "vcpus":           None,
                            "memory_gb":       None,
                            "storage_info":    f"Blob Storage {tier.capitalize()} LRS",
                            "region_code":     region_code,
                            "price_usd":       price,
                            "meter_name":      item.get("meterName", ""),
                            "pricing_unit":    "per_gb_month",
                            "storage_tier":    tier,
                        })
                        blob_added = True

                except Exception as exc:
                    print(f"  [Azure] WARN: Blob Storage fetch failed for {region_code}: {exc}")

                if not blob_added:
                    # Use fallback prices with small regional multiplier
                    mult = 1.0 if region_code in ("eastus", "eastus2", "westus2") else 1.08
                    for tier, info in _BLOB_FALLBACK.items():
                        entries.append({
                            "instance_name":   f"AzureBlob-{tier.capitalize()}-LRS",
                            "service_category": "storage",
                            "vcpus":           None,
                            "memory_gb":       None,
                            "storage_info":    f"Blob Storage {tier.capitalize()} LRS",
                            "region_code":     region_code,
                            "price_usd":       round(info["price"] * mult, 7),
                            "meter_name":      f"Blob Storage {tier.capitalize()} LRS Data Stored",
                            "pricing_unit":    info["pricing_unit"],
                            "storage_tier":    info["storage_tier"],
                        })

                # ── Azure Functions ─────────────────────────────────────
                print(f"  [Azure] Fetching Azure Functions for {region_code}…")
                func_filter = (
                    f"serviceName eq 'Azure Functions' and "
                    f"armRegionName eq '{region_code}' and "
                    f"priceType eq 'Consumption'"
                )
                func_added = False
                try:
                    func_items = self._fetch_page(func_filter, client)
                    for item in func_items:
                        meter = item.get("meterName", "").lower()
                        price = item.get("retailPrice", 0)
                        if price <= 0:
                            continue

                        if "execution" in meter or "invocation" in meter:
                            entries.append({
                                "instance_name":   "Azure-Functions-Invocations",
                                "service_category": "serverless",
                                "vcpus":           None,
                                "memory_gb":       None,
                                "storage_info":    None,
                                "region_code":     region_code,
                                "price_usd":       price,
                                "meter_name":      item.get("meterName", ""),
                                "pricing_unit":    "per_request",
                                "storage_tier":    None,
                            })
                            func_added = True
                        elif "duration" in meter or "gb second" in meter or "gb-second" in meter:
                            entries.append({
                                "instance_name":   "Azure-Functions-Duration",
                                "service_category": "serverless",
                                "vcpus":           None,
                                "memory_gb":       None,
                                "storage_info":    None,
                                "region_code":     region_code,
                                "price_usd":       price,
                                "meter_name":      item.get("meterName", ""),
                                "pricing_unit":    "per_gb_second",
                                "storage_tier":    None,
                            })
                            func_added = True

                except Exception as exc:
                    print(f"  [Azure] WARN: Azure Functions fetch failed for {region_code}: {exc}")

                if not func_added:
                    mult = 1.0 if region_code in ("eastus", "eastus2", "westus2") else 1.08
                    for fb in _FUNCTIONS_FALLBACK:
                        entries.append({
                            "instance_name":   fb["name"],
                            "service_category": "serverless",
                            "vcpus":           None,
                            "memory_gb":       None,
                            "storage_info":    None,
                            "region_code":     region_code,
                            "price_usd":       round(fb["price"] * mult, 10),
                            "meter_name":      fb["name"],
                            "pricing_unit":    fb["pricing_unit"],
                            "storage_tier":    None,
                        })

                # ── AKS (Azure Kubernetes Service) ───────────────────────
                # AKS cluster management is free (standard tier); Uptime SLA = $0.10/cluster/hour
                # We record the SLA-tier cluster price as the representative entry
                print(f"  [Azure] Adding AKS entry for {region_code}…")
                entries.append({
                    "instance_name":   "AKS-Cluster-UptimeSLA",
                    "service_category": "containers",
                    "vcpus":           None,
                    "memory_gb":       None,
                    "storage_info":    "Managed Kubernetes cluster (Uptime SLA)",
                    "region_code":     region_code,
                    "price_usd":       _AKS_CLUSTER_PRICE,
                    "meter_name":      "AKS Uptime SLA",
                    "pricing_unit":    "per_cluster_hour",
                    "storage_tier":    None,
                })

        return entries

    # ── Specs lookup table (Azure doesn't include specs in pricing API) ──
    _SPECS: dict[str, tuple[int, float]] = {
        # B-series (burstable)
        "Standard_B2s":   (2,   4.0),
        "Standard_B2ms":  (2,   8.0),
        "Standard_B4ms":  (4,  16.0),
        "Standard_B8ms":  (8,  32.0),
        # D-series v3
        "Standard_D2s_v3":  (2,  8.0),
        "Standard_D4s_v3":  (4, 16.0),
        "Standard_D8s_v3":  (8, 32.0),
        "Standard_D16s_v3": (16, 64.0),
        # D-series v5
        "Standard_D2s_v5":  (2,  8.0),
        "Standard_D4s_v5":  (4, 16.0),
        "Standard_D8s_v5":  (8, 32.0),
        "Standard_D16s_v5": (16, 64.0),
        # Dav4 / Das (AMD)
        "Standard_D2as_v4": (2,  8.0),
        "Standard_D4as_v4": (4, 16.0),
        "Standard_D8as_v4": (8, 32.0),
        # E-series (memory optimised)
        "Standard_E4s_v3":  (4,  32.0),
        "Standard_E8s_v3":  (8,  64.0),
        "Standard_E16s_v3": (16, 128.0),
        "Standard_E4s_v5":  (4,  32.0),
        "Standard_E8s_v5":  (8,  64.0),
        "Standard_E16s_v5": (16, 128.0),
        "Standard_E4as_v4": (4,  32.0),
        "Standard_E8as_v4": (8,  64.0),
        # F-series (compute optimised)
        "Standard_F2s_v2":  (2,  4.0),
        "Standard_F4s_v2":  (4,  8.0),
        "Standard_F8s_v2":  (8, 16.0),
        # SQL / MySQL / PostgreSQL vCore
        "GP_Gen5_2":   (2, 10.0),
        "GP_Gen5_4":   (4, 20.0),
        "GP_Gen5_8":   (8, 40.0),
        "GP_Gen5_16":  (16, 81.0),
        "BC_Gen5_2":   (2, 10.0),
        "BC_Gen5_4":   (4, 20.0),
        "BC_Gen5_8":   (8, 40.0),
        # MySQL/PostgreSQL Flexible Server
        "GP_Standard_D2ds_v4": (2,  8.0),
        "GP_Standard_D4ds_v4": (4, 16.0),
        "GP_Standard_D8ds_v4": (8, 32.0),
        "BC_Standard_D2ds_v4": (2,  8.0),
        "BC_Standard_D4ds_v4": (4, 16.0),
        "BC_Standard_D8ds_v4": (8, 32.0),
    }

    def normalize_data(self, raw: list[dict]) -> list[dict]:
        seen: set[tuple[str, str]] = set()
        result: list[dict] = []

        for entry in raw:
            name = entry["instance_name"]
            region = entry["region_code"]
            key = (name, region)
            if key in seen:
                continue
            seen.add(key)

            specs = self._SPECS.get(name)
            vcpus = specs[0] if specs else entry.get("vcpus")
            mem = specs[1] if specs else entry.get("memory_gb")

            cat = entry["service_category"]
            pricing_unit = entry.get("pricing_unit", "per_hour")
            storage_tier = entry.get("storage_tier")
            od = entry["price_usd"]

            # Non-hourly services: no RI pricing
            if pricing_unit == "per_hour":
                ri_1y = round(od * (1 - _RI_DISCOUNT_1Y), 6)
                ri_3y = round(od * (1 - _RI_DISCOUNT_3Y), 6)
            else:
                ri_1y = None
                ri_3y = None

            result.append({
                "instance_name":             name,
                "service_category":          cat,
                "vcpus":                     vcpus,
                "memory_gb":                 mem,
                "storage_info":              entry.get("storage_info"),
                "equivalent_group":          _equiv(cat, vcpus, mem),
                "region_code":               region,
                "price_per_hour_ondemand":   od,
                "price_per_hour_reserved_1y": ri_1y,
                "price_per_hour_reserved_3y": ri_3y,
                "currency":                  "USD",
                "pricing_unit":              pricing_unit,
                "storage_tier":              storage_tier,
            })

        return result

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
                    vcpus=rec["vcpus"],
                    memory_gb=rec["memory_gb"],
                    storage_info=rec.get("storage_info"),
                    equivalent_group=rec.get("equivalent_group"),
                    pricing_unit=rec.get("pricing_unit", "per_hour"),
                    storage_tier=rec.get("storage_tier"),
                )
                self.db.add(it)
                self.db.flush()
            else:
                it.vcpus = rec["vcpus"]
                it.memory_gb = rec["memory_gb"]
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
