"""Generate committed pricing JSON files from live data sources.

Run this locally (NOT in Docker) to refresh pricing data:

    cd backend
    python -m app.scripts.generate_pricing_json

Writes three files to app/data/pricing/:
    aws_pricing.json
    azure_pricing.json
    gcp_pricing.json

Commit the updated files. Docker startup loads from JSON — no scraping needed.
"""

from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

# ─── Output directory ────────────────────────────────────────────────────────

OUTPUT_DIR = Path(__file__).parent.parent / "data" / "pricing"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ═══════════════════════════════════════════════════════════════════════════════
# AWS
# ═══════════════════════════════════════════════════════════════════════════════

AWS_REGIONS = [
    "us-east-1", "us-east-2", "us-west-1", "us-west-2",
    "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1",
    "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-south-1",
]

EC2_URL    = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/{region}/index.csv"
RDS_URL    = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/{region}/index.csv"
S3_URL     = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/{region}/index.csv"
LAMBDA_URL = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/{region}/index.csv"
EKS_URL    = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEKS/current/{region}/index.csv"

# Only these specific instances are kept
WANTED_EC2: set[str] = {
    "t3.micro", "t3.small", "t3.medium", "t3.large", "t3.xlarge",
    "t4g.micro", "t4g.small", "t4g.medium", "t4g.large",
    "m5.large", "m5.xlarge", "m6i.large", "m6i.xlarge", "m7i.large",
    "c5.large", "c5.xlarge", "c6i.large", "c6i.xlarge",
    "r5.large", "r5.xlarge", "r6i.large", "r6i.xlarge",
}

WANTED_RDS: set[str] = {
    "db.t3.micro", "db.t3.small", "db.t3.medium", "db.t3.large",
    "db.m5.large", "db.m6i.large",
    "db.r5.large", "db.r6i.large",
}

_AWS_METADATA_LINES = 5

_AWS_EQUIV_MAP: dict[tuple[str, int, float], str] = {
    ("compute", 2, 0.5):   "nano-compute",
    ("compute", 2, 1.0):   "xs-compute",
    ("compute", 2, 4.0):   "small-compute",
    ("compute", 2, 8.0):   "medium-compute",
    ("compute", 4, 16.0):  "large-compute",
    ("compute", 8, 16.0):  "large-compute-optimized",
    ("compute", 8, 32.0):  "xlarge-compute",
    ("compute", 8, 64.0):  "xlarge-memory",
    ("compute", 16, 32.0): "2xl-compute-optimized",
    ("compute", 16, 64.0): "2xl-compute",
    ("compute", 32, 128.0):"4xl-compute",
    ("database", 2, 1.0):  "xs-database",
    ("database", 2, 2.0):  "small-database",
    ("database", 2, 8.0):  "medium-database",
    ("database", 2, 16.0): "medium-database-mem",
    ("database", 4, 16.0): "large-database",
    ("database", 4, 32.0): "large-database-mem",
    ("database", 8, 32.0): "xlarge-database",
    ("database", 8, 64.0): "xlarge-database-mem",
    ("database", 16, 64.0):"2xl-database",
    ("database", 16, 128.0):"2xl-database-mem",
}

_S3_TIERS = [
    ("S3-Standard",             "standard",            "Amazon S3 Standard"),
    ("S3-Intelligent-Tiering",  "intelligent-tiering", "Amazon S3 Intelligent-Tiering"),
    ("S3-Glacier",              "glacier",             "Amazon S3 Glacier"),
    ("S3-Glacier-Deep-Archive", "deep-archive",        "Amazon S3 Glacier Deep Archive"),
]

_S3_FALLBACK: dict[str, dict[str, float]] = {
    "us-east-1":      {"standard": 0.023,  "intelligent-tiering": 0.023,  "glacier": 0.004,   "deep-archive": 0.00099},
    "us-east-2":      {"standard": 0.023,  "intelligent-tiering": 0.023,  "glacier": 0.004,   "deep-archive": 0.00099},
    "us-west-1":      {"standard": 0.026,  "intelligent-tiering": 0.026,  "glacier": 0.0045,  "deep-archive": 0.00099},
    "us-west-2":      {"standard": 0.023,  "intelligent-tiering": 0.023,  "glacier": 0.004,   "deep-archive": 0.00099},
    "eu-west-1":      {"standard": 0.023,  "intelligent-tiering": 0.023,  "glacier": 0.004,   "deep-archive": 0.00099},
    "eu-west-2":      {"standard": 0.024,  "intelligent-tiering": 0.024,  "glacier": 0.0045,  "deep-archive": 0.00108},
    "eu-west-3":      {"standard": 0.024,  "intelligent-tiering": 0.024,  "glacier": 0.0045,  "deep-archive": 0.00108},
    "eu-central-1":   {"standard": 0.0245, "intelligent-tiering": 0.0245, "glacier": 0.0045,  "deep-archive": 0.00108},
    "ap-southeast-1": {"standard": 0.025,  "intelligent-tiering": 0.025,  "glacier": 0.005,   "deep-archive": 0.00114},
    "ap-southeast-2": {"standard": 0.025,  "intelligent-tiering": 0.025,  "glacier": 0.005,   "deep-archive": 0.00114},
    "ap-northeast-1": {"standard": 0.025,  "intelligent-tiering": 0.025,  "glacier": 0.005,   "deep-archive": 0.00120},
    "ap-south-1":     {"standard": 0.0238, "intelligent-tiering": 0.0238, "glacier": 0.0045,  "deep-archive": 0.00099},
}

_LAMBDA_FALLBACK: dict[str, dict[str, float]] = {
    "default":        {"request": 2e-7,    "duration": 1.6667e-5},
    "ap-southeast-2": {"request": 2e-7,    "duration": 1.6667e-5},
    "ap-south-1":     {"request": 2.3e-7,  "duration": 1.9167e-5},
}

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


def _aws_equiv(cat: str, vcpus: int | None, mem: float | None) -> str | None:
    if vcpus is None or mem is None:
        return None
    return _AWS_EQUIV_MAP.get((cat, vcpus, mem))


def _parse_memory(raw: str) -> float | None:
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


def _stream_csv_rows(url: str, timeout: int = 180):
    """Stream an AWS pricing CSV line-by-line, yielding row dicts."""
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
                        if skipped < _AWS_METADATA_LINES:
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

                # leftover last line
                if buf.strip() and header is not None:
                    row_vals = next(csv.reader([buf.strip()]), [])
                    if row_vals:
                        if len(row_vals) < len(header):
                            row_vals += [""] * (len(header) - len(row_vals))
                        yield dict(zip(header, row_vals))

    except Exception as exc:
        print(f"    WARN: download failed — {exc}")
        return


def _aws_ec2_region(region: str) -> list[dict]:
    print(f"  [AWS] EC2 {region}…", flush=True)
    url = EC2_URL.format(region=region)

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
        if inst not in WANTED_EC2:
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

    results = []
    for inst, info in ondemand.items():
        results.append({
            "instance_name": inst,
            "service_category": "compute",
            "vcpus": info["vcpus"],
            "memory_gb": info["memory_gb"],
            "storage_info": info["storage"] or None,
            "storage_tier": None,
            "pricing_unit": "per_hour",
            "equivalent_group": _aws_equiv("compute", info["vcpus"], info["memory_gb"]),
            "region_code": region,
            "price_per_hour_ondemand": info["price"],
            "price_per_hour_reserved_1y": reserved_1y.get(inst),
            "price_per_hour_reserved_3y": reserved_3y.get(inst),
            "currency": "USD",
        })
    print(f"    → {len(results)} EC2 instances", flush=True)
    return results


def _aws_rds_region(region: str) -> list[dict]:
    print(f"  [AWS] RDS {region}…", flush=True)
    url = RDS_URL.format(region=region)

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
        if inst not in WANTED_RDS:
            continue
        price = _parse_price(row.get("PricePerUnit", ""))
        if price is None:
            continue
        term = row.get("TermType")
        if term == "OnDemand":
            if row.get("Deployment Option") != "Single-AZ":
                continue
            if inst not in ondemand or price < ondemand[inst]["price"]:
                ondemand[inst] = {
                    "price": price,
                    "engine": engine,
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

    results = []
    for inst, info in ondemand.items():
        results.append({
            "instance_name": inst,
            "service_category": "database",
            "vcpus": info["vcpus"],
            "memory_gb": info["memory_gb"],
            "storage_info": info["storage"] or None,
            "storage_tier": None,
            "pricing_unit": "per_hour",
            "equivalent_group": _aws_equiv("database", info["vcpus"], info["memory_gb"]),
            "region_code": region,
            "price_per_hour_ondemand": info["price"],
            "price_per_hour_reserved_1y": reserved_1y.get(inst),
            "price_per_hour_reserved_3y": reserved_3y.get(inst),
            "currency": "USD",
        })
    print(f"    → {len(results)} RDS instances", flush=True)
    return results


def _aws_s3_region(region: str) -> list[dict]:
    print(f"  [AWS] S3 {region}…", flush=True)
    url = S3_URL.format(region=region)
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
        for _, tier, _ in _S3_TIERS:
            if tier == "standard" and vol_type in ("Amazon S3 Standard", "General Purpose"):
                csv_prices.setdefault("standard", price)
            elif tier == "intelligent-tiering" and "Intelligent" in vol_type:
                csv_prices.setdefault("intelligent-tiering", price)
            elif tier == "glacier" and vol_type in ("Amazon Glacier", "Amazon S3 Glacier"):
                csv_prices.setdefault("glacier", price)
            elif tier == "deep-archive" and "Deep Archive" in vol_type:
                csv_prices.setdefault("deep-archive", price)

    fallback = _S3_FALLBACK.get(region, _S3_FALLBACK["us-east-1"])
    results = []
    for name, tier, storage_info in _S3_TIERS:
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
    source = "CSV" if csv_prices else "fallback"
    print(f"    → {len(results)} S3 tiers ({source})", flush=True)
    return results


def _aws_lambda_region(region: str) -> list[dict]:
    print(f"  [AWS] Lambda {region}…", flush=True)
    url = LAMBDA_URL.format(region=region)
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
            break

    fallback = _LAMBDA_FALLBACK.get(region, _LAMBDA_FALLBACK["default"])
    req_price = req_price or fallback["request"]
    dur_price = dur_price or fallback["duration"]

    return [
        {
            "instance_name": "Lambda-Request",
            "service_category": "serverless",
            "vcpus": None, "memory_gb": None,
            "storage_info": "AWS Lambda invocation pricing",
            "storage_tier": None, "pricing_unit": "per_request",
            "equivalent_group": None, "region_code": region,
            "price_per_hour_ondemand": req_price,
            "price_per_hour_reserved_1y": None,
            "price_per_hour_reserved_3y": None,
            "currency": "USD",
        },
        {
            "instance_name": "Lambda-Duration",
            "service_category": "serverless",
            "vcpus": None, "memory_gb": None,
            "storage_info": "AWS Lambda compute duration pricing",
            "storage_tier": None, "pricing_unit": "per_gb_second",
            "equivalent_group": None, "region_code": region,
            "price_per_hour_ondemand": dur_price,
            "price_per_hour_reserved_1y": None,
            "price_per_hour_reserved_3y": None,
            "currency": "USD",
        },
    ]


def _aws_eks_region(region: str) -> list[dict]:
    print(f"  [AWS] EKS {region}…", flush=True)
    url = EKS_URL.format(region=region)
    cluster_price: float | None = None
    fargate_vcpu:  float | None = None
    fargate_gb:    float | None = None

    for row in _stream_csv_rows(url):
        if row.get("TermType") != "OnDemand":
            continue
        price = _parse_price(row.get("PricePerUnit", ""))
        if price is None:
            continue
        desc = (row.get("Product Name", "") + row.get("Description", "")).lower()
        unit = row.get("Unit", "").lower()
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

    return [
        {
            "instance_name": "EKS-Cluster",
            "service_category": "containers",
            "vcpus": None, "memory_gb": None,
            "storage_info": "Amazon EKS cluster management",
            "storage_tier": None, "pricing_unit": "per_cluster_hour",
            "equivalent_group": None, "region_code": region,
            "price_per_hour_ondemand": cluster_price,
            "price_per_hour_reserved_1y": None,
            "price_per_hour_reserved_3y": None,
            "currency": "USD",
        },
        {
            "instance_name": "Fargate-vCPU",
            "service_category": "containers",
            "vcpus": None, "memory_gb": None,
            "storage_info": "AWS Fargate per vCPU",
            "storage_tier": None, "pricing_unit": "per_vcpu_hour",
            "equivalent_group": None, "region_code": region,
            "price_per_hour_ondemand": fargate_vcpu,
            "price_per_hour_reserved_1y": None,
            "price_per_hour_reserved_3y": None,
            "currency": "USD",
        },
        {
            "instance_name": "Fargate-Memory",
            "service_category": "containers",
            "vcpus": None, "memory_gb": None,
            "storage_info": "AWS Fargate per GB memory",
            "storage_tier": None, "pricing_unit": "per_gb_hour",
            "equivalent_group": None, "region_code": region,
            "price_per_hour_ondemand": fargate_gb,
            "price_per_hour_reserved_1y": None,
            "price_per_hour_reserved_3y": None,
            "currency": "USD",
        },
    ]


def generate_aws() -> None:
    print("\n" + "=" * 60)
    print("Generating AWS pricing data…")
    print("=" * 60)

    records: list[dict] = []
    for region in AWS_REGIONS:
        print(f"\n[{region}]", flush=True)
        region_records: list[dict] = []
        region_records.extend(_aws_ec2_region(region))
        region_records.extend(_aws_rds_region(region))
        region_records.extend(_aws_s3_region(region))
        region_records.extend(_aws_lambda_region(region))
        region_records.extend(_aws_eks_region(region))

        # Deduplicate within region
        seen: set[tuple[str, str]] = set()
        for rec in region_records:
            key = (rec["instance_name"], rec["region_code"])
            if key not in seen:
                seen.add(key)
                records.append(rec)

    out_path = OUTPUT_DIR / "aws_pricing.json"
    with open(out_path, "w") as f:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(), "records": records}, f, indent=2)
    print(f"\nWrote {len(records)} records → {out_path}", flush=True)


# ═══════════════════════════════════════════════════════════════════════════════
# Azure
# ═══════════════════════════════════════════════════════════════════════════════

AZURE_REGIONS: dict[str, str] = {
    "eastus":        "East US",
    "eastus2":       "East US 2",
    "westus2":       "West US 2",
    "westus3":       "West US 3",
    "westeurope":    "West Europe",
    "northeurope":   "North Europe",
    "uksouth":       "UK South",
    "francecentral": "France Central",
    "southeastasia": "Southeast Asia",
    "australiaeast": "Australia East",
    "japaneast":     "Japan East",
    "centralindia":  "Central India",
}

_AZ_VM_SERIES = {
    "Standard_B2", "Standard_B4", "Standard_B8",
    "Standard_D2s", "Standard_D4s", "Standard_D8s", "Standard_D16s",
    "Standard_D2as", "Standard_D4as", "Standard_D8as",
    "Standard_E4s", "Standard_E8s", "Standard_E16s",
    "Standard_E4as", "Standard_E8as",
    "Standard_F2s", "Standard_F4s", "Standard_F8s",
}

_AZ_RI_1Y = 0.35
_AZ_RI_3Y = 0.52
_AZ_CLUSTER_PRICE = 0.10

_AZ_EQUIV_MAP: dict[tuple[str, int, float], str] = {
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

_AZ_SPECS: dict[str, tuple[int, float]] = {
    "Standard_B2s":   (2,   4.0), "Standard_B2ms":  (2,   8.0),
    "Standard_B4ms":  (4,  16.0), "Standard_B8ms":  (8,  32.0),
    "Standard_D2s_v3":  (2,  8.0), "Standard_D4s_v3":  (4, 16.0),
    "Standard_D8s_v3":  (8, 32.0), "Standard_D16s_v3": (16, 64.0),
    "Standard_D2s_v5":  (2,  8.0), "Standard_D4s_v5":  (4, 16.0),
    "Standard_D8s_v5":  (8, 32.0), "Standard_D16s_v5": (16, 64.0),
    "Standard_D2as_v4": (2,  8.0), "Standard_D4as_v4": (4, 16.0),
    "Standard_D8as_v4": (8, 32.0),
    "Standard_E4s_v3":  (4,  32.0), "Standard_E8s_v3":  (8,  64.0),
    "Standard_E16s_v3": (16, 128.0), "Standard_E4s_v5":  (4,  32.0),
    "Standard_E8s_v5":  (8,  64.0), "Standard_E16s_v5": (16, 128.0),
    "Standard_E4as_v4": (4,  32.0), "Standard_E8as_v4": (8,  64.0),
    "Standard_F2s_v2":  (2,  4.0), "Standard_F4s_v2":  (4,  8.0),
    "Standard_F8s_v2":  (8, 16.0),
    "GP_Gen5_2":  (2, 10.0), "GP_Gen5_4":   (4, 20.0),
    "GP_Gen5_8":  (8, 40.0), "GP_Gen5_16":  (16, 81.0),
    "BC_Gen5_2":  (2, 10.0), "BC_Gen5_4":   (4, 20.0),
    "BC_Gen5_8":  (8, 40.0),
    "GP_Standard_D2ds_v4": (2,  8.0), "GP_Standard_D4ds_v4": (4, 16.0),
    "GP_Standard_D8ds_v4": (8, 32.0), "BC_Standard_D2ds_v4": (2,  8.0),
    "BC_Standard_D4ds_v4": (4, 16.0), "BC_Standard_D8ds_v4": (8, 32.0),
}

_AZ_BLOB_FALLBACK = {
    "hot":     {"price": 0.018,   "pricing_unit": "per_gb_month", "storage_tier": "hot"},
    "cool":    {"price": 0.01,    "pricing_unit": "per_gb_month", "storage_tier": "cool"},
    "archive": {"price": 0.00099, "pricing_unit": "per_gb_month", "storage_tier": "archive"},
}

_AZ_FUNCTIONS_FALLBACK = [
    {"name": "Azure-Functions-Invocations", "price": 0.0000002,  "pricing_unit": "per_request"},
    {"name": "Azure-Functions-Duration",    "price": 0.000016,   "pricing_unit": "per_gb_second"},
]


def _az_equiv(cat: str, vcpus: int | None, mem: float | None) -> str | None:
    if vcpus is None or mem is None:
        return None
    return _AZ_EQUIV_MAP.get((cat, vcpus, mem))


def _az_fetch_page(client: httpx.Client, odata_filter: str) -> list[dict]:
    BASE = "https://prices.azure.com/api/retail/prices"
    items: list[dict] = []
    url: str | None = f"{BASE}?$filter={odata_filter}"
    while url:
        resp = client.get(url, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        items.extend(data.get("Items", []))
        url = data.get("NextPageLink")
        if len(items) > 5000:
            break
    return items


def generate_azure() -> None:
    print("\n" + "=" * 60)
    print("Generating Azure pricing data…")
    print("=" * 60)

    raw: list[dict] = []

    with httpx.Client(timeout=60) as client:
        for region_code in AZURE_REGIONS:
            print(f"\n[{region_code}]", flush=True)

            # VMs
            print(f"  [Azure] VMs…", flush=True)
            vm_filter = (
                f"serviceName eq 'Virtual Machines' and "
                f"armRegionName eq '{region_code}' and "
                f"priceType eq 'Consumption' and "
                f"contains(productName, 'Windows') eq false"
            )
            try:
                vm_items = _az_fetch_page(client, vm_filter)
            except Exception as exc:
                print(f"    WARN: VM fetch failed: {exc}", flush=True)
                vm_items = []

            for item in vm_items:
                sku = item.get("armSkuName", "")
                if not any(sku.startswith(s) for s in _AZ_VM_SERIES):
                    continue
                if item.get("type") != "Consumption":
                    continue
                if "Hour" not in item.get("unitOfMeasure", ""):
                    continue
                price = item.get("retailPrice", 0)
                if price <= 0:
                    continue
                raw.append({
                    "instance_name": sku, "service_category": "compute",
                    "vcpus": None, "memory_gb": None, "storage_info": None,
                    "region_code": region_code, "price_usd": price,
                    "pricing_unit": "per_hour", "storage_tier": None,
                })

            # SQL Database
            print(f"  [Azure] SQL Database…", flush=True)
            sql_filter = (
                f"serviceName eq 'SQL Database' and "
                f"armRegionName eq '{region_code}' and "
                f"priceType eq 'Consumption'"
            )
            try:
                sql_items = _az_fetch_page(client, sql_filter)
            except Exception as exc:
                print(f"    WARN: SQL fetch failed: {exc}", flush=True)
                sql_items = []

            for item in sql_items:
                if "Hour" not in item.get("unitOfMeasure", ""):
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
                raw.append({
                    "instance_name": sku, "service_category": "database",
                    "vcpus": None, "memory_gb": None, "storage_info": None,
                    "region_code": region_code, "price_usd": price,
                    "pricing_unit": "per_hour", "storage_tier": None,
                })

            # MySQL / PostgreSQL
            for db_service in ("Azure Database for MySQL", "Azure Database for PostgreSQL"):
                print(f"  [Azure] {db_service}…", flush=True)
                db_filter = (
                    f"serviceName eq '{db_service}' and "
                    f"armRegionName eq '{region_code}' and "
                    f"priceType eq 'Consumption'"
                )
                try:
                    db_items = _az_fetch_page(client, db_filter)
                except Exception as exc:
                    print(f"    WARN: {db_service} fetch failed: {exc}", flush=True)
                    db_items = []

                for item in db_items:
                    if "Hour" not in item.get("unitOfMeasure", ""):
                        continue
                    price = item.get("retailPrice", 0)
                    if price <= 0:
                        continue
                    sku = item.get("armSkuName", "") or item.get("skuName", "")
                    if not sku:
                        continue
                    product = item.get("productName", "")
                    if "General Purpose" not in product and "Business Critical" not in product:
                        continue
                    short = "MySQL" if "MySQL" in db_service else "PostgreSQL"
                    raw.append({
                        "instance_name": f"{short}-{sku}", "service_category": "database",
                        "vcpus": None, "memory_gb": None, "storage_info": None,
                        "region_code": region_code, "price_usd": price,
                        "pricing_unit": "per_hour", "storage_tier": None,
                    })

            # Blob Storage
            print(f"  [Azure] Blob Storage…", flush=True)
            blob_filter = (
                f"serviceName eq 'Storage' and "
                f"armRegionName eq '{region_code}' and "
                f"priceType eq 'Consumption'"
            )
            blob_added = False
            try:
                blob_items = _az_fetch_page(client, blob_filter)
                for item in blob_items:
                    meter = item.get("meterName", "").lower()
                    sku_name = item.get("skuName", "").lower()
                    price = item.get("retailPrice", 0)
                    if price <= 0 or "lrs" not in sku_name:
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
                    raw.append({
                        "instance_name": f"AzureBlob-{tier.capitalize()}-LRS",
                        "service_category": "storage",
                        "vcpus": None, "memory_gb": None,
                        "storage_info": f"Blob Storage {tier.capitalize()} LRS",
                        "region_code": region_code, "price_usd": price,
                        "pricing_unit": "per_gb_month", "storage_tier": tier,
                    })
                    blob_added = True
            except Exception as exc:
                print(f"    WARN: Blob Storage fetch failed: {exc}", flush=True)

            if not blob_added:
                mult = 1.0 if region_code in ("eastus", "eastus2", "westus2") else 1.08
                for tier, info in _AZ_BLOB_FALLBACK.items():
                    raw.append({
                        "instance_name": f"AzureBlob-{tier.capitalize()}-LRS",
                        "service_category": "storage",
                        "vcpus": None, "memory_gb": None,
                        "storage_info": f"Blob Storage {tier.capitalize()} LRS",
                        "region_code": region_code,
                        "price_usd": round(info["price"] * mult, 7),
                        "pricing_unit": info["pricing_unit"],
                        "storage_tier": tier,
                    })

            # Azure Functions
            print(f"  [Azure] Functions…", flush=True)
            func_filter = (
                f"serviceName eq 'Azure Functions' and "
                f"armRegionName eq '{region_code}' and "
                f"priceType eq 'Consumption'"
            )
            func_added = False
            try:
                func_items = _az_fetch_page(client, func_filter)
                for item in func_items:
                    meter = item.get("meterName", "").lower()
                    price = item.get("retailPrice", 0)
                    if price <= 0:
                        continue
                    if "execution" in meter or "invocation" in meter:
                        raw.append({
                            "instance_name": "Azure-Functions-Invocations",
                            "service_category": "serverless",
                            "vcpus": None, "memory_gb": None, "storage_info": None,
                            "region_code": region_code, "price_usd": price,
                            "pricing_unit": "per_request", "storage_tier": None,
                        })
                        func_added = True
                    elif "duration" in meter or "gb second" in meter or "gb-second" in meter:
                        raw.append({
                            "instance_name": "Azure-Functions-Duration",
                            "service_category": "serverless",
                            "vcpus": None, "memory_gb": None, "storage_info": None,
                            "region_code": region_code, "price_usd": price,
                            "pricing_unit": "per_gb_second", "storage_tier": None,
                        })
                        func_added = True
            except Exception as exc:
                print(f"    WARN: Functions fetch failed: {exc}", flush=True)

            if not func_added:
                mult = 1.0 if region_code in ("eastus", "eastus2", "westus2") else 1.08
                for fb in _AZ_FUNCTIONS_FALLBACK:
                    raw.append({
                        "instance_name": fb["name"],
                        "service_category": "serverless",
                        "vcpus": None, "memory_gb": None, "storage_info": None,
                        "region_code": region_code,
                        "price_usd": round(fb["price"] * mult, 10),
                        "pricing_unit": fb["pricing_unit"], "storage_tier": None,
                    })

            # AKS
            raw.append({
                "instance_name": "AKS-Cluster-UptimeSLA",
                "service_category": "containers",
                "vcpus": None, "memory_gb": None,
                "storage_info": "Managed Kubernetes cluster (Uptime SLA)",
                "region_code": region_code, "price_usd": _AZ_CLUSTER_PRICE,
                "pricing_unit": "per_cluster_hour", "storage_tier": None,
            })

    # Normalize (deduplicate + compute RI prices + add specs)
    seen: set[tuple[str, str]] = set()
    records: list[dict] = []
    for entry in raw:
        name = entry["instance_name"]
        region = entry["region_code"]
        key = (name, region)
        if key in seen:
            continue
        seen.add(key)

        specs = _AZ_SPECS.get(name)
        vcpus = specs[0] if specs else entry.get("vcpus")
        mem   = specs[1] if specs else entry.get("memory_gb")
        cat   = entry["service_category"]
        pricing_unit = entry.get("pricing_unit", "per_hour")
        od    = entry["price_usd"]

        if pricing_unit == "per_hour":
            ri_1y = round(od * (1 - _AZ_RI_1Y), 6)
            ri_3y = round(od * (1 - _AZ_RI_3Y), 6)
        else:
            ri_1y = None
            ri_3y = None

        records.append({
            "instance_name": name,
            "service_category": cat,
            "vcpus": vcpus,
            "memory_gb": mem,
            "storage_info": entry.get("storage_info"),
            "storage_tier": entry.get("storage_tier"),
            "pricing_unit": pricing_unit,
            "equivalent_group": _az_equiv(cat, vcpus, mem),
            "region_code": region,
            "price_per_hour_ondemand": od,
            "price_per_hour_reserved_1y": ri_1y,
            "price_per_hour_reserved_3y": ri_3y,
            "currency": "USD",
        })

    out_path = OUTPUT_DIR / "azure_pricing.json"
    with open(out_path, "w") as f:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(), "records": records}, f, indent=2)
    print(f"\nWrote {len(records)} records → {out_path}", flush=True)


# ═══════════════════════════════════════════════════════════════════════════════
# GCP
# ═══════════════════════════════════════════════════════════════════════════════

def generate_gcp() -> None:
    print("\n" + "=" * 60)
    print("Generating GCP pricing data…")
    print("=" * 60)

    mock_file = Path(__file__).parent.parent / "scrapers" / "gcp_mock_data.json"
    with open(mock_file) as f:
        raw = json.load(f)

    records: list[dict] = []
    for entry in raw:
        ri_1y = entry.get("ri_discount_1y", 0.25)
        ri_3y = entry.get("ri_discount_3y", 0.40)
        pricing_unit = entry.get("pricing_unit", "per_hour")
        storage_tier = entry.get("storage_tier")

        for region_code, price_usd in entry.get("regions", {}).items():
            if pricing_unit == "per_hour" and ri_1y and ri_1y > 0:
                reserved_1y = round(price_usd * (1 - ri_1y), 6)
                reserved_3y = round(price_usd * (1 - ri_3y), 6)
            else:
                reserved_1y = None
                reserved_3y = None

            records.append({
                "instance_name": entry["instance_name"],
                "service_category": entry["service_category"],
                "vcpus": entry.get("vcpus"),
                "memory_gb": entry.get("memory_gb"),
                "storage_info": entry.get("storage_info"),
                "storage_tier": storage_tier,
                "pricing_unit": pricing_unit,
                "equivalent_group": entry.get("equivalent_group"),
                "region_code": region_code,
                "price_per_hour_ondemand": price_usd,
                "price_per_hour_reserved_1y": reserved_1y,
                "price_per_hour_reserved_3y": reserved_3y,
                "currency": "USD",
            })

    out_path = OUTPUT_DIR / "gcp_pricing.json"
    with open(out_path, "w") as f:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(), "records": records}, f, indent=2)
    print(f"Wrote {len(records)} records → {out_path}", flush=True)


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    providers = sys.argv[1:] or ["aws", "azure", "gcp"]
    if "aws" in providers:
        generate_aws()
    if "azure" in providers:
        generate_azure()
    if "gcp" in providers:
        generate_gcp()
    print("\nDone. Commit the updated files in backend/app/data/pricing/")


if __name__ == "__main__":
    main()
