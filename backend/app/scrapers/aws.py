"""AWS pricing scraper — regional CSV approach.

Downloads per-region CSV files from the public AWS pricing endpoint.
These are much smaller than the global JSON (20-50 MB per region vs 1+ GB).

EC2:    https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/{region}/index.csv
RDS:    https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/{region}/index.csv
S3:     https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/{region}/index.csv
Lambda: https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/{region}/index.csv
EKS:    https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEKS/current/{region}/index.csv
"""

import csv
import gc
from datetime import datetime

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import InstanceType, Pricing, Provider, Region, ServiceCategory
from app.scrapers.base import BaseScraper

# ─── Configuration ────────────────────────────────────────────────────────────

TARGET_REGIONS = [
    "us-east-1", "us-east-2", "us-west-1", "us-west-2",
    "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1",
    "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-south-1",
]

EC2_URL    = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/{region}/index.csv"
RDS_URL    = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/{region}/index.csv"
S3_URL     = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/{region}/index.csv"
LAMBDA_URL = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/{region}/index.csv"
EKS_URL    = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEKS/current/{region}/index.csv"

# Instance families to keep
_EC2_FAMILIES = {"t3", "t4g", "m5", "m6i", "m7i", "c5", "c6i", "r5", "r6i", "r7i"}
_RDS_FAMILIES = {"db.t3", "db.t4g", "db.m5", "db.m6i", "db.r5", "db.r6i"}

# Metadata lines before the CSV header in AWS pricing files
_METADATA_LINES = 5

# Equivalent group mapping (category, vcpus, memory_gb)
_EQUIV_MAP = {
    ("compute", 2, 0.5):  "nano-compute",
    ("compute", 2, 1.0):  "xs-compute",
    ("compute", 2, 4.0):  "small-compute",
    ("compute", 2, 8.0):  "medium-compute",
    ("compute", 4, 16.0): "large-compute",
    ("compute", 8, 16.0): "large-compute-optimized",
    ("compute", 8, 32.0): "xlarge-compute",
    ("compute", 8, 64.0): "xlarge-memory",
    ("compute", 16, 32.0): "2xl-compute-optimized",
    ("compute", 16, 64.0): "2xl-compute",
    ("compute", 32, 128.0): "4xl-compute",
    ("database", 2, 1.0):  "xs-database",
    ("database", 2, 2.0):  "small-database",
    ("database", 2, 8.0):  "medium-database",
    ("database", 2, 16.0): "medium-database-mem",
    ("database", 4, 16.0): "large-database",
    ("database", 4, 32.0): "large-database-mem",
    ("database", 8, 32.0): "xlarge-database",
    ("database", 8, 64.0): "xlarge-database-mem",
    ("database", 16, 64.0): "2xl-database",
    ("database", 16, 128.0): "2xl-database-mem",
}

# S3 storage tier mapping
_S3_TIER_DEFS = [
    ("S3-Standard",            "standard",            "Amazon S3 Standard"),
    ("S3-Intelligent-Tiering", "intelligent-tiering", "Amazon S3 Intelligent-Tiering"),
    ("S3-Glacier",             "glacier",             "Amazon S3 Glacier"),
    ("S3-Glacier-Deep-Archive","deep-archive",         "Amazon S3 Glacier Deep Archive"),
]


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _equiv(cat: str, vcpus: int | None, mem: float | None) -> str | None:
    if vcpus is None or mem is None:
        return None
    return _EQUIV_MAP.get((cat, vcpus, mem))


def _parse_memory(raw: str) -> float | None:
    """Parse '16 GiB' → 16.0"""
    try:
        return float(raw.replace(" GiB", "").replace(",", "").strip())
    except (ValueError, AttributeError):
        return None


def _parse_int(raw: str) -> int | None:
    try:
        return int(raw.strip())
    except (ValueError, AttributeError):
        return None


def _parse_price(raw: str) -> float | None:
    try:
        v = float(raw.strip())
        return v if v > 0 else None
    except (ValueError, AttributeError):
        return None


def _instance_family(name: str, rds: bool = False) -> str:
    parts = name.split(".")
    if rds and len(parts) >= 2:
        return f"{parts[0]}.{parts[1]}"
    return parts[0] if parts else ""


# ─── Streaming CSV download ────────────────────────────────────────────────────


def _stream_csv_rows(url: str, timeout: int = 120):
    """Stream-download a pricing CSV and yield row dicts one at a time.

    Uses a line buffer so only one line is held in memory at a time.
    Skips the first _METADATA_LINES lines (AWS metadata header).
    """
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            with client.stream("GET", url) as resp:
                resp.raise_for_status()
                buf = ""
                skipped = 0
                header: list[str] | None = None

                for raw_chunk in resp.iter_bytes(chunk_size=65536):
                    buf += raw_chunk.decode("utf-8", errors="replace")

                    while "\n" in buf:
                        line, buf = buf.split("\n", 1)

                        if skipped < _METADATA_LINES:
                            skipped += 1
                            continue

                        if header is None:
                            parsed = next(csv.reader([line]), [])
                            if parsed:
                                header = parsed
                            continue

                        row_vals = next(csv.reader([line]), [])
                        if row_vals:
                            if len(row_vals) < len(header):
                                row_vals += [""] * (len(header) - len(row_vals))
                            yield dict(zip(header, row_vals))

                # Handle leftover buffer (last line without trailing newline)
                if buf.strip() and header is not None:
                    row_vals = next(csv.reader([buf.strip()]), [])
                    if row_vals:
                        if len(row_vals) < len(header):
                            row_vals += [""] * (len(header) - len(row_vals))
                        yield dict(zip(header, row_vals))

    except Exception as exc:
        print(f"    WARN: download failed — {exc}")
        return


# ─── EC2 ──────────────────────────────────────────────────────────────────────


def _scrape_ec2_region(region: str) -> list[dict]:
    url = EC2_URL.format(region=region)
    print(f"  [AWS] EC2 {region} — downloading…")

    ondemand: dict[str, dict] = {}
    reserved_1y: dict[str, float] = {}
    reserved_3y: dict[str, float] = {}

    for row in _stream_csv_rows(url):
        if row.get("Product Family") != "Compute Instance":
            continue
        if row.get("Operating System") != "Linux":
            continue
        if row.get("Tenancy") != "Shared":
            continue

        inst = row.get("Instance Type", "").strip()
        if not inst or _instance_family(inst) not in _EC2_FAMILIES:
            continue

        price = _parse_price(row.get("PricePerUnit", ""))
        if price is None:
            continue

        term = row.get("TermType")
        if term == "OnDemand":
            if row.get("CapacityStatus") != "Used":
                continue
            if row.get("Pre Installed S/W", "NA") != "NA":
                continue
            if inst not in ondemand or price < ondemand[inst]["price"]:
                ondemand[inst] = {
                    "price": price,
                    "vcpus": _parse_int(row.get("vCPU", "")),
                    "memory_gb": _parse_memory(row.get("Memory", "")),
                    "storage": row.get("Storage", ""),
                }
        elif term == "Reserved":
            if row.get("OfferingClass") != "standard":
                continue
            if row.get("PurchaseOption") != "No Upfront":
                continue
            lease = row.get("LeaseContractLength", "").strip()
            if lease == "1yr":
                if inst not in reserved_1y or price < reserved_1y[inst]:
                    reserved_1y[inst] = price
            elif lease == "3yr":
                if inst not in reserved_3y or price < reserved_3y[inst]:
                    reserved_3y[inst] = price

    results: list[dict] = []
    for inst, info in ondemand.items():
        results.append({
            "instance_name": inst,
            "service_category": "compute",
            "vcpus": info["vcpus"],
            "memory_gb": info["memory_gb"],
            "storage_info": info["storage"] or None,
            "storage_tier": None,
            "pricing_unit": "per_hour",
            "equivalent_group": _equiv("compute", info["vcpus"], info["memory_gb"]),
            "region_code": region,
            "price_per_hour_ondemand": info["price"],
            "price_per_hour_reserved_1y": reserved_1y.get(inst),
            "price_per_hour_reserved_3y": reserved_3y.get(inst),
            "currency": "USD",
        })

    print(f"  [AWS] EC2 {region} — {len(results)} instances")
    return results


# ─── RDS ──────────────────────────────────────────────────────────────────────


def _scrape_rds_region(region: str) -> list[dict]:
    url = RDS_URL.format(region=region)
    print(f"  [AWS] RDS {region} — downloading…")

    ondemand: dict[str, dict] = {}
    reserved_1y: dict[str, float] = {}
    reserved_3y: dict[str, float] = {}

    for row in _stream_csv_rows(url):
        if row.get("Product Family") != "Database Instance":
            continue

        engine = row.get("Database Engine", "")
        if engine not in ("MySQL", "PostgreSQL"):
            continue

        inst = row.get("Instance Type", "").strip()
        if not inst or _instance_family(inst, rds=True) not in _RDS_FAMILIES:
            continue

        price = _parse_price(row.get("PricePerUnit", ""))
        if price is None:
            continue

        term = row.get("TermType")
        if term == "OnDemand":
            if row.get("Deployment Option") != "Single-AZ":
                continue
            key = inst
            if key not in ondemand or (engine == "MySQL" and ondemand[key].get("engine") != "MySQL"):
                ondemand[key] = {
                    "price": price,
                    "engine": engine,
                    "vcpus": _parse_int(row.get("vCPU", "")),
                    "memory_gb": _parse_memory(row.get("Memory", "")),
                    "storage": row.get("Storage", ""),
                }
            elif price < ondemand[key]["price"]:
                ondemand[key]["price"] = price
        elif term == "Reserved":
            if row.get("OfferingClass") != "standard":
                continue
            if row.get("PurchaseOption") != "No Upfront":
                continue
            lease = row.get("LeaseContractLength", "").strip()
            if lease == "1yr":
                if inst not in reserved_1y or price < reserved_1y[inst]:
                    reserved_1y[inst] = price
            elif lease == "3yr":
                if inst not in reserved_3y or price < reserved_3y[inst]:
                    reserved_3y[inst] = price

    results: list[dict] = []
    for inst, info in ondemand.items():
        results.append({
            "instance_name": inst,
            "service_category": "database",
            "vcpus": info["vcpus"],
            "memory_gb": info["memory_gb"],
            "storage_info": info["storage"] or None,
            "storage_tier": None,
            "pricing_unit": "per_hour",
            "equivalent_group": _equiv("database", info["vcpus"], info["memory_gb"]),
            "region_code": region,
            "price_per_hour_ondemand": info["price"],
            "price_per_hour_reserved_1y": reserved_1y.get(inst),
            "price_per_hour_reserved_3y": reserved_3y.get(inst),
            "currency": "USD",
        })

    print(f"  [AWS] RDS {region} — {len(results)} instances")
    return results


# ─── S3 ───────────────────────────────────────────────────────────────────────

# Known fallback prices for S3 tiers (USD per GB-month) if CSV unavailable
_S3_FALLBACK: dict[str, dict[str, float]] = {
    "us-east-1":      {"standard": 0.023, "intelligent-tiering": 0.023, "glacier": 0.0040, "deep-archive": 0.00099},
    "us-east-2":      {"standard": 0.023, "intelligent-tiering": 0.023, "glacier": 0.0040, "deep-archive": 0.00099},
    "us-west-1":      {"standard": 0.026, "intelligent-tiering": 0.026, "glacier": 0.0045, "deep-archive": 0.00099},
    "us-west-2":      {"standard": 0.023, "intelligent-tiering": 0.023, "glacier": 0.0040, "deep-archive": 0.00099},
    "eu-west-1":      {"standard": 0.023, "intelligent-tiering": 0.023, "glacier": 0.0040, "deep-archive": 0.00099},
    "eu-west-2":      {"standard": 0.024, "intelligent-tiering": 0.024, "glacier": 0.0045, "deep-archive": 0.00108},
    "eu-west-3":      {"standard": 0.024, "intelligent-tiering": 0.024, "glacier": 0.0045, "deep-archive": 0.00108},
    "eu-central-1":   {"standard": 0.0245,"intelligent-tiering": 0.0245,"glacier": 0.0045, "deep-archive": 0.00108},
    "ap-southeast-1": {"standard": 0.025, "intelligent-tiering": 0.025, "glacier": 0.0050, "deep-archive": 0.00114},
    "ap-southeast-2": {"standard": 0.025, "intelligent-tiering": 0.025, "glacier": 0.0050, "deep-archive": 0.00114},
    "ap-northeast-1": {"standard": 0.025, "intelligent-tiering": 0.025, "glacier": 0.0050, "deep-archive": 0.00120},
    "ap-south-1":     {"standard": 0.0238,"intelligent-tiering": 0.0238,"glacier": 0.0045, "deep-archive": 0.00099},
}


def _scrape_s3_region(region: str) -> list[dict]:
    url = S3_URL.format(region=region)
    print(f"  [AWS] S3 {region} — downloading…")

    csv_prices: dict[str, float] = {}
    for row in _stream_csv_rows(url):
        if row.get("TermType") != "OnDemand":
            continue
        if row.get("Product Family") not in ("Storage", "Amazon S3"):
            continue
        unit = row.get("Unit", "")
        if "GB-Mo" not in unit and "GB-month" not in unit:
            continue
        price = _parse_price(row.get("PricePerUnit", ""))
        if price is None:
            continue
        vol_type = row.get("Volume Type", "")
        for _, tier, _ in _S3_TIER_DEFS:
            if tier == "standard" and vol_type in ("Amazon S3 Standard", "General Purpose"):
                csv_prices.setdefault("standard", price)
            elif tier == "intelligent-tiering" and "Intelligent" in vol_type:
                csv_prices.setdefault("intelligent-tiering", price)
            elif tier == "glacier" and vol_type in ("Amazon Glacier", "Amazon S3 Glacier"):
                csv_prices.setdefault("glacier", price)
            elif tier == "deep-archive" and "Deep Archive" in vol_type:
                csv_prices.setdefault("deep-archive", price)

    fallback = _S3_FALLBACK.get(region, _S3_FALLBACK["us-east-1"])

    results: list[dict] = []
    for name, tier, storage_info in _S3_TIER_DEFS:
        price = csv_prices.get(tier) or fallback.get(tier)
        if price is None:
            continue
        results.append({
            "instance_name": name,
            "service_category": "storage",
            "vcpus": None,
            "memory_gb": None,
            "storage_info": storage_info,
            "storage_tier": tier,
            "pricing_unit": "per_gb_month",
            "equivalent_group": None,
            "region_code": region,
            "price_per_hour_ondemand": price,
            "price_per_hour_reserved_1y": None,
            "price_per_hour_reserved_3y": None,
            "currency": "USD",
        })

    print(f"  [AWS] S3 {region} — {len(results)} tiers ({'CSV' if csv_prices else 'fallback'})")
    return results


# ─── Lambda ───────────────────────────────────────────────────────────────────

# Fallback Lambda prices per region
_LAMBDA_FALLBACK: dict[str, dict[str, float]] = {
    "default":        {"request": 2e-7, "duration": 1.6667e-5},
    "ap-southeast-2": {"request": 2e-7, "duration": 1.6667e-5},
    "ap-south-1":     {"request": 2.3e-7, "duration": 1.9167e-5},
}


def _scrape_lambda_region(region: str) -> list[dict]:
    url = LAMBDA_URL.format(region=region)
    print(f"  [AWS] Lambda {region} — downloading…")

    req_price: float | None = None
    dur_price: float | None = None

    for row in _stream_csv_rows(url):
        if row.get("TermType") != "OnDemand":
            continue
        group = row.get("Group", "")
        price = _parse_price(row.get("PricePerUnit", ""))
        if price is None:
            continue
        if group == "AWS-Lambda-Requests" and req_price is None:
            req_price = price
        elif group == "AWS-Lambda-Duration" and dur_price is None:
            dur_price = price
        if req_price is not None and dur_price is not None:
            break  # got both, no need to read further

    fallback = _LAMBDA_FALLBACK.get(region, _LAMBDA_FALLBACK["default"])
    req_price = req_price or fallback["request"]
    dur_price = dur_price or fallback["duration"]

    results = [
        {
            "instance_name": "Lambda-Request",
            "service_category": "serverless",
            "vcpus": None,
            "memory_gb": None,
            "storage_info": "AWS Lambda invocation pricing",
            "storage_tier": None,
            "pricing_unit": "per_request",
            "equivalent_group": None,
            "region_code": region,
            "price_per_hour_ondemand": req_price,
            "price_per_hour_reserved_1y": None,
            "price_per_hour_reserved_3y": None,
            "currency": "USD",
        },
        {
            "instance_name": "Lambda-Duration",
            "service_category": "serverless",
            "vcpus": None,
            "memory_gb": None,
            "storage_info": "AWS Lambda compute duration pricing",
            "storage_tier": None,
            "pricing_unit": "per_gb_second",
            "equivalent_group": None,
            "region_code": region,
            "price_per_hour_ondemand": dur_price,
            "price_per_hour_reserved_1y": None,
            "price_per_hour_reserved_3y": None,
            "currency": "USD",
        },
    ]
    print(f"  [AWS] Lambda {region} — {len(results)} entries")
    return results


# ─── EKS / Fargate ────────────────────────────────────────────────────────────

_EKS_FALLBACK: dict[str, dict[str, float]] = {
    "default":        {"cluster": 0.10, "fargate_vcpu": 0.04048, "fargate_gb": 0.004445},
    "eu-west-1":      {"cluster": 0.10, "fargate_vcpu": 0.04458, "fargate_gb": 0.004890},
    "eu-west-2":      {"cluster": 0.10, "fargate_vcpu": 0.04633, "fargate_gb": 0.005088},
    "eu-west-3":      {"cluster": 0.10, "fargate_vcpu": 0.04633, "fargate_gb": 0.005088},
    "eu-central-1":   {"cluster": 0.10, "fargate_vcpu": 0.04502, "fargate_gb": 0.004942},
    "ap-southeast-1": {"cluster": 0.10, "fargate_vcpu": 0.04646, "fargate_gb": 0.005098},
    "ap-southeast-2": {"cluster": 0.10, "fargate_vcpu": 0.04695, "fargate_gb": 0.005150},
    "ap-northeast-1": {"cluster": 0.10, "fargate_vcpu": 0.04695, "fargate_gb": 0.005150},
    "ap-south-1":     {"cluster": 0.10, "fargate_vcpu": 0.04048, "fargate_gb": 0.004445},
}


def _scrape_eks_region(region: str) -> list[dict]:
    url = EKS_URL.format(region=region)
    print(f"  [AWS] EKS {region} — downloading…")

    cluster_price: float | None = None
    fargate_vcpu:  float | None = None
    fargate_gb:    float | None = None

    for row in _stream_csv_rows(url):
        if row.get("TermType") != "OnDemand":
            continue
        price = _parse_price(row.get("PricePerUnit", ""))
        if price is None:
            continue
        desc  = (row.get("Product Name", "") + row.get("Description", "")).lower()
        unit  = row.get("Unit", "").lower()
        if "cluster" in desc and "hour" in unit and cluster_price is None:
            cluster_price = price
        elif "fargate" in desc:
            if "vcpu" in unit and fargate_vcpu is None:
                fargate_vcpu = price
            elif "gb" in unit and fargate_gb is None:
                fargate_gb = price

    fallback = _EKS_FALLBACK.get(region, _EKS_FALLBACK["default"])
    cluster_price = cluster_price or fallback["cluster"]
    fargate_vcpu  = fargate_vcpu  or fallback["fargate_vcpu"]
    fargate_gb    = fargate_gb    or fallback["fargate_gb"]

    results = [
        {
            "instance_name": "EKS-Cluster",
            "service_category": "containers",
            "vcpus": None,
            "memory_gb": None,
            "storage_info": "Amazon EKS cluster management",
            "storage_tier": None,
            "pricing_unit": "per_cluster_hour",
            "equivalent_group": None,
            "region_code": region,
            "price_per_hour_ondemand": cluster_price,
            "price_per_hour_reserved_1y": None,
            "price_per_hour_reserved_3y": None,
            "currency": "USD",
        },
        {
            "instance_name": "Fargate-vCPU",
            "service_category": "containers",
            "vcpus": None,
            "memory_gb": None,
            "storage_info": "AWS Fargate per vCPU",
            "storage_tier": None,
            "pricing_unit": "per_vcpu_hour",
            "equivalent_group": None,
            "region_code": region,
            "price_per_hour_ondemand": fargate_vcpu,
            "price_per_hour_reserved_1y": None,
            "price_per_hour_reserved_3y": None,
            "currency": "USD",
        },
        {
            "instance_name": "Fargate-Memory",
            "service_category": "containers",
            "vcpus": None,
            "memory_gb": None,
            "storage_info": "AWS Fargate per GB memory",
            "storage_tier": None,
            "pricing_unit": "per_gb_hour",
            "equivalent_group": None,
            "region_code": region,
            "price_per_hour_ondemand": fargate_gb,
            "price_per_hour_reserved_1y": None,
            "price_per_hour_reserved_3y": None,
            "currency": "USD",
        },
    ]
    print(f"  [AWS] EKS {region} — {len(results)} entries")
    return results


# ─── Scraper class ────────────────────────────────────────────────────────────


class AWSScraper(BaseScraper):
    def __init__(self, db: Session):
        super().__init__(db)
        self._provider: Provider | None = None

    def _get_provider(self) -> Provider:
        if self._provider is None:
            self._provider = self.db.scalars(
                select(Provider).where(Provider.name == "aws")
            ).one()
        return self._provider

    def run(self) -> int:
        """Process one region at a time to keep memory usage low."""
        total = 0
        for region in TARGET_REGIONS:
            region_records: list[dict] = []
            region_records.extend(_scrape_ec2_region(region))
            region_records.extend(_scrape_rds_region(region))
            region_records.extend(_scrape_s3_region(region))
            region_records.extend(_scrape_lambda_region(region))
            region_records.extend(_scrape_eks_region(region))

            # Deduplicate within this region's batch
            seen: set[tuple[str, str]] = set()
            deduped: list[dict] = []
            for rec in region_records:
                key = (rec["instance_name"], rec["region_code"])
                if key not in seen:
                    seen.add(key)
                    deduped.append(rec)

            total += self.save_to_db(deduped)
            del region_records, deduped, seen
            gc.collect()

        return total

    def fetch_data(self) -> list[dict]:
        # Not called — run() is overridden to process region by region
        return []

    def normalize_data(self, raw: list[dict]) -> list[dict]:
        # Deduplication is handled inside run()
        return raw

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
                it.storage_info = rec.get("storage_info")
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
