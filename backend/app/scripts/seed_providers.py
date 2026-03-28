"""Seed the database with providers, regions, and service categories."""

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Provider, Region, ServiceCategory

PROVIDERS = [
    {"name": "aws", "display_name": "Amazon Web Services"},
    {"name": "azure", "display_name": "Microsoft Azure"},
    {"name": "gcp", "display_name": "Google Cloud Platform"},
]

REGIONS = {
    "aws": [
        {"code": "us-east-1",      "display_name": "US East (N. Virginia)"},
        {"code": "us-east-2",      "display_name": "US East (Ohio)"},
        {"code": "us-west-1",      "display_name": "US West (N. California)"},
        {"code": "us-west-2",      "display_name": "US West (Oregon)"},
        {"code": "eu-west-1",      "display_name": "EU (Ireland)"},
        {"code": "eu-west-2",      "display_name": "EU (London)"},
        {"code": "eu-west-3",      "display_name": "EU (Paris)"},
        {"code": "eu-central-1",   "display_name": "EU (Frankfurt)"},
        {"code": "ap-southeast-1", "display_name": "Asia Pacific (Singapore)"},
        {"code": "ap-southeast-2", "display_name": "Asia Pacific (Sydney)"},
        {"code": "ap-northeast-1", "display_name": "Asia Pacific (Tokyo)"},
        {"code": "ap-south-1",     "display_name": "Asia Pacific (Mumbai)"},
    ],
    "azure": [
        {"code": "eastus",         "display_name": "East US"},
        {"code": "eastus2",        "display_name": "East US 2"},
        {"code": "westus2",        "display_name": "West US 2"},
        {"code": "westus3",        "display_name": "West US 3"},
        {"code": "westeurope",     "display_name": "West Europe"},
        {"code": "northeurope",    "display_name": "North Europe"},
        {"code": "uksouth",        "display_name": "UK South"},
        {"code": "francecentral",  "display_name": "France Central"},
        {"code": "southeastasia",  "display_name": "Southeast Asia"},
        {"code": "australiaeast",  "display_name": "Australia East"},
        {"code": "japaneast",      "display_name": "Japan East"},
        {"code": "centralindia",   "display_name": "Central India"},
    ],
    "gcp": [
        {"code": "us-central1",          "display_name": "US Central (Iowa)"},
        {"code": "us-east1",             "display_name": "US East (South Carolina)"},
        {"code": "us-west1",             "display_name": "US West (Oregon)"},
        {"code": "us-east4",             "display_name": "US East (N. Virginia)"},
        {"code": "europe-west1",         "display_name": "Europe West (Belgium)"},
        {"code": "europe-west2",         "display_name": "Europe West (London)"},
        {"code": "europe-west3",         "display_name": "Europe West (Frankfurt)"},
        {"code": "europe-west4",         "display_name": "Europe West (Netherlands)"},
        {"code": "asia-southeast1",      "display_name": "Asia Southeast (Singapore)"},
        {"code": "australia-southeast1", "display_name": "Australia Southeast (Sydney)"},
        {"code": "asia-northeast1",      "display_name": "Asia Northeast (Tokyo)"},
        {"code": "asia-south1",          "display_name": "Asia South (Mumbai)"},
    ],
}

SERVICE_CATEGORIES = ["compute", "database", "storage", "serverless", "containers"]


def seed():
    db = SessionLocal()
    try:
        # Providers
        for p_data in PROVIDERS:
            existing = db.scalars(
                select(Provider).where(Provider.name == p_data["name"])
            ).first()
            if not existing:
                db.add(Provider(**p_data))
                print(f"  Created provider: {p_data['name']}")
            else:
                print(f"  Provider exists: {p_data['name']}")
        db.flush()

        # Regions
        for provider_name, region_list in REGIONS.items():
            provider = db.scalars(
                select(Provider).where(Provider.name == provider_name)
            ).one()
            for r_data in region_list:
                existing = db.scalars(
                    select(Region).where(
                        Region.provider_id == provider.id,
                        Region.code == r_data["code"],
                    )
                ).first()
                if not existing:
                    db.add(Region(provider_id=provider.id, **r_data))
                    print(f"  Created region: {provider_name}/{r_data['code']}")
                else:
                    print(f"  Region exists: {provider_name}/{r_data['code']}")

        # Service categories
        for cat_name in SERVICE_CATEGORIES:
            existing = db.scalars(
                select(ServiceCategory).where(ServiceCategory.name == cat_name)
            ).first()
            if not existing:
                db.add(ServiceCategory(name=cat_name))
                print(f"  Created service category: {cat_name}")
            else:
                print(f"  Category exists: {cat_name}")

        db.commit()
        print("\nSeed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
