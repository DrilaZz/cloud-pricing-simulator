"""Cross-provider region equivalence mapping.

Maps any region code to the equivalent regions on all three providers.
Based on geographic proximity (same datacenter location / city / area).
"""

from typing import Optional


# Each key is a region code from any provider.
# Value is a dict mapping provider name -> equivalent region code.
REGION_EQUIVALENTS: dict[str, dict[str, str]] = {
    # ─── US East ─────────────────────────────────────────────────────
    "us-east-1":       {"aws": "us-east-1",       "azure": "eastus",          "gcp": "us-east1"},
    "us-east-2":       {"aws": "us-east-2",       "azure": "eastus2",         "gcp": "us-east4"},
    "eastus":          {"aws": "us-east-1",       "azure": "eastus",          "gcp": "us-east1"},
    "eastus2":         {"aws": "us-east-2",       "azure": "eastus2",         "gcp": "us-east4"},
    "us-east1":        {"aws": "us-east-1",       "azure": "eastus",          "gcp": "us-east1"},
    "us-east4":        {"aws": "us-east-2",       "azure": "eastus2",         "gcp": "us-east4"},

    # ─── US West ──────────────────────────────────────────────────────
    "us-west-1":       {"aws": "us-west-1",       "azure": "westus",          "gcp": "us-west1"},
    "us-west-2":       {"aws": "us-west-2",       "azure": "westus2",         "gcp": "us-west2"},
    "westus":          {"aws": "us-west-1",       "azure": "westus",          "gcp": "us-west1"},
    "westus2":         {"aws": "us-west-2",       "azure": "westus2",         "gcp": "us-west2"},
    "westus3":         {"aws": "us-west-2",       "azure": "westus3",         "gcp": "us-west2"},
    "us-west1":        {"aws": "us-west-1",       "azure": "westus",          "gcp": "us-west1"},
    "us-west2":        {"aws": "us-west-2",       "azure": "westus2",         "gcp": "us-west2"},

    # ─── US Central ──────────────────────────────────────────────────
    "us-central1":     {"aws": "us-east-1",       "azure": "centralus",       "gcp": "us-central1"},
    "centralus":       {"aws": "us-east-1",       "azure": "centralus",       "gcp": "us-central1"},

    # ─── Europe West ─────────────────────────────────────────────────
    "eu-west-1":       {"aws": "eu-west-1",       "azure": "westeurope",      "gcp": "europe-west1"},
    "eu-west-2":       {"aws": "eu-west-2",       "azure": "uksouth",         "gcp": "europe-west2"},
    "eu-west-3":       {"aws": "eu-west-3",       "azure": "francecentral",   "gcp": "europe-west9"},
    "westeurope":      {"aws": "eu-west-1",       "azure": "westeurope",      "gcp": "europe-west1"},
    "northeurope":     {"aws": "eu-west-1",       "azure": "northeurope",     "gcp": "europe-west1"},
    "uksouth":         {"aws": "eu-west-2",       "azure": "uksouth",         "gcp": "europe-west2"},
    "francecentral":   {"aws": "eu-west-3",       "azure": "francecentral",   "gcp": "europe-west9"},
    "europe-west1":    {"aws": "eu-west-1",       "azure": "westeurope",      "gcp": "europe-west1"},
    "europe-west2":    {"aws": "eu-west-2",       "azure": "uksouth",         "gcp": "europe-west2"},
    "europe-west4":    {"aws": "eu-west-1",       "azure": "westeurope",      "gcp": "europe-west4"},

    # ─── Europe Central ──────────────────────────────────────────────
    "eu-central-1":    {"aws": "eu-central-1",    "azure": "germanywestcentral", "gcp": "europe-west3"},
    "germanywestcentral": {"aws": "eu-central-1", "azure": "germanywestcentral", "gcp": "europe-west3"},
    "europe-west3":    {"aws": "eu-central-1",    "azure": "germanywestcentral", "gcp": "europe-west3"},

    # ─── AP Southeast ────────────────────────────────────────────────
    "ap-southeast-1":  {"aws": "ap-southeast-1",  "azure": "southeastasia",   "gcp": "asia-southeast1"},
    "ap-southeast-2":  {"aws": "ap-southeast-2",  "azure": "australiaeast",   "gcp": "australia-southeast1"},
    "southeastasia":   {"aws": "ap-southeast-1",  "azure": "southeastasia",   "gcp": "asia-southeast1"},
    "australiaeast":   {"aws": "ap-southeast-2",  "azure": "australiaeast",   "gcp": "australia-southeast1"},
    "asia-southeast1": {"aws": "ap-southeast-1",  "azure": "southeastasia",   "gcp": "asia-southeast1"},
    "australia-southeast1": {"aws": "ap-southeast-2", "azure": "australiaeast", "gcp": "australia-southeast1"},

    # ─── AP Northeast ────────────────────────────────────────────────
    "ap-northeast-1":  {"aws": "ap-northeast-1",  "azure": "japaneast",       "gcp": "asia-northeast1"},
    "japaneast":       {"aws": "ap-northeast-1",  "azure": "japaneast",       "gcp": "asia-northeast1"},
    "asia-northeast1": {"aws": "ap-northeast-1",  "azure": "japaneast",       "gcp": "asia-northeast1"},

    # ─── AP South ────────────────────────────────────────────────────
    "ap-south-1":      {"aws": "ap-south-1",      "azure": "centralindia",    "gcp": "asia-south1"},
    "centralindia":    {"aws": "ap-south-1",      "azure": "centralindia",    "gcp": "asia-south1"},
    "asia-south1":     {"aws": "ap-south-1",      "azure": "centralindia",    "gcp": "asia-south1"},
}

# Default fallback per provider when region is unknown
PROVIDER_DEFAULT_REGIONS = {
    "aws":   "us-east-1",
    "azure": "eastus",
    "gcp":   "us-central1",
}


def get_equivalent_regions(region_code: str) -> dict[str, str]:
    """Given any region code, return {provider: region_code} for all providers.

    Falls back to provider defaults if the region is not in the mapping.
    """
    mapping = REGION_EQUIVALENTS.get(region_code)
    if mapping:
        return mapping
    # Unknown region: try provider defaults
    return PROVIDER_DEFAULT_REGIONS.copy()


def get_equivalent_region(region_code: str, target_provider: str) -> str:
    """Return the equivalent region code for target_provider."""
    mapping = REGION_EQUIVALENTS.get(region_code, PROVIDER_DEFAULT_REGIONS)
    return mapping.get(target_provider, PROVIDER_DEFAULT_REGIONS.get(target_provider, region_code))
