"""update_equivalent_groups.py

Assigns or corrects the equivalent_group field on all instance_types in the DB.

Groups instances by (category × vcpu_tier × memory_tier) into cross-provider
comparable sets so that the multi-cloud comparison endpoint can find real prices.

Run once after seeding + scraping:
    cd backend && python -m app.scripts.update_equivalent_groups

Or via the full init flow (seed → scrapers → this script).
"""

import sys
from pathlib import Path

# Allow running as `python -m app.scripts.update_equivalent_groups`
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import select
from app.database import SessionLocal
from app.models import InstanceType, ServiceCategory


# ─── Name-based override mapping ──────────────────────────────────────────────
# Exact instance name → group.  These take priority over the spec-based mapping.

NAME_TO_GROUP: dict[str, str] = {
    # ── AWS EC2 general purpose ──────────────────────────────────────────────
    "t3.nano":          "compute-gp-nano",
    "t3.micro":         "compute-gp-nano",
    "t4g.nano":         "compute-gp-nano",
    "t4g.micro":        "compute-gp-nano",
    "t3.small":         "compute-gp-small",
    "t4g.small":        "compute-gp-small",
    "t3.medium":        "compute-gp-small",
    "t4g.medium":       "compute-gp-small",
    "t3.large":         "compute-gp-medium",
    "t4g.large":        "compute-gp-medium",
    "m5.large":         "compute-gp-medium",
    "m6i.large":        "compute-gp-medium",
    "m7i.large":        "compute-gp-medium",
    "m5.xlarge":        "compute-gp-large",
    "m6i.xlarge":       "compute-gp-large",
    "m7i.xlarge":       "compute-gp-large",
    "m5.2xlarge":       "compute-gp-xlarge",
    "m6i.2xlarge":      "compute-gp-xlarge",
    "m7i.2xlarge":      "compute-gp-xlarge",
    "m5.4xlarge":       "compute-gp-2xl",
    "m6i.4xlarge":      "compute-gp-2xl",
    "m7i.4xlarge":      "compute-gp-2xl",
    # ── AWS EC2 compute optimized ─────────────────────────────────────────────
    "c5.large":         "compute-co-small",
    "c6i.large":        "compute-co-small",
    "c5.xlarge":        "compute-co-large",
    "c6i.xlarge":       "compute-co-large",
    "c5.2xlarge":       "compute-co-xlarge",
    "c6i.2xlarge":      "compute-co-xlarge",
    "c5.4xlarge":       "compute-co-2xl",
    "c6i.4xlarge":      "compute-co-2xl",
    # ── AWS EC2 memory optimized ──────────────────────────────────────────────
    "r5.large":         "compute-mo-medium",
    "r6i.large":        "compute-mo-medium",
    "r5.xlarge":        "compute-mo-large",
    "r6i.xlarge":       "compute-mo-large",
    "r5.2xlarge":       "compute-mo-xlarge",
    "r6i.2xlarge":      "compute-mo-xlarge",
    "r5.4xlarge":       "compute-mo-2xl",
    "r6i.4xlarge":      "compute-mo-2xl",
    # ── AWS RDS ───────────────────────────────────────────────────────────────
    "db.t3.micro":      "db-xs",
    "db.t3.small":      "db-small",
    "db.t3.medium":     "db-medium",
    "db.t3.large":      "db-large",
    "db.t4g.micro":     "db-xs",
    "db.t4g.small":     "db-small",
    "db.t4g.medium":    "db-medium",
    "db.m5.large":      "db-medium",
    "db.m6i.large":     "db-medium",
    "db.m5.xlarge":     "db-large",
    "db.m6i.xlarge":    "db-large",
    "db.m5.2xlarge":    "db-xlarge",
    "db.m6i.2xlarge":   "db-xlarge",
    "db.r5.large":      "db-mo-medium",
    "db.r6i.large":     "db-mo-medium",
    "db.r5.xlarge":     "db-mo-large",
    "db.r6i.xlarge":    "db-mo-large",
    # ── AWS S3 ────────────────────────────────────────────────────────────────
    "S3-Standard":              "storage-standard",
    "S3-Intelligent-Tiering":   "storage-standard",
    "S3-Glacier-Instant":       "storage-infrequent",
    "S3-Glacier":               "storage-archive",
    "S3-Glacier-Deep-Archive":  "storage-deep-archive",
    # ── AWS Lambda ────────────────────────────────────────────────────────────
    "Lambda-Invocations": "serverless-invocations",
    "Lambda-Duration":    "serverless-duration",
    # ── AWS EKS ───────────────────────────────────────────────────────────────
    "EKS-Cluster": "containers-cluster",

    # ── Azure VMs general purpose ─────────────────────────────────────────────
    "Standard_B2s":         "compute-gp-small",
    "Standard_B2ms":        "compute-gp-medium",
    "Standard_B4ms":        "compute-gp-large",
    "Standard_B8ms":        "compute-gp-xlarge",
    "Standard_D2s_v3":      "compute-gp-medium",
    "Standard_D4s_v3":      "compute-gp-large",
    "Standard_D8s_v3":      "compute-gp-xlarge",
    "Standard_D2s_v5":      "compute-gp-medium",
    "Standard_D4s_v5":      "compute-gp-large",
    "Standard_D8s_v5":      "compute-gp-xlarge",
    "Standard_D16s_v5":     "compute-gp-2xl",
    "Standard_D2as_v4":     "compute-gp-medium",
    "Standard_D4as_v4":     "compute-gp-large",
    "Standard_D8as_v4":     "compute-gp-xlarge",
    # ── Azure VMs compute optimized ───────────────────────────────────────────
    "Standard_F2s_v2":      "compute-co-small",
    "Standard_F4s_v2":      "compute-co-large",
    "Standard_F8s_v2":      "compute-co-xlarge",
    # ── Azure VMs memory optimized ────────────────────────────────────────────
    "Standard_E4s_v5":      "compute-mo-large",
    "Standard_E8s_v5":      "compute-mo-xlarge",
    "Standard_E16s_v5":     "compute-mo-2xl",
    "Standard_E4as_v4":     "compute-mo-large",
    "Standard_E8as_v4":     "compute-mo-xlarge",
    # ── Azure Database (flexible server) ──────────────────────────────────────
    # MySQL/PostgreSQL Flexible — name pattern: GP_S_Gen5_<vcpu> or GP_Gen5_<vcpu>
    # These are set by the spec-based mapping below
    # ── Azure Blob Storage ────────────────────────────────────────────────────
    "Azure-Blob-Hot":       "storage-standard",
    "Azure-Blob-Cool":      "storage-infrequent",
    "Azure-Blob-Archive":   "storage-archive",
    # ── Azure Functions ───────────────────────────────────────────────────────
    "Azure-Functions-Invocations": "serverless-invocations",
    "Azure-Functions-Duration":    "serverless-duration",
    # ── AKS ───────────────────────────────────────────────────────────────────
    "AKS-Cluster": "containers-cluster",

    # ── GCP Compute general purpose ───────────────────────────────────────────
    "e2-micro":         "compute-gp-nano",
    "e2-small":         "compute-gp-small",
    "e2-medium":        "compute-gp-small",
    "n1-standard-1":    "compute-gp-nano",
    "n1-standard-2":    "compute-gp-medium",
    "n1-standard-4":    "compute-gp-large",
    "n1-standard-8":    "compute-gp-xlarge",
    "n2-standard-2":    "compute-gp-medium",
    "n2-standard-4":    "compute-gp-large",
    "n2-standard-8":    "compute-gp-xlarge",
    "n2d-standard-2":   "compute-gp-medium",
    "n2d-standard-4":   "compute-gp-large",
    "n2d-standard-8":   "compute-gp-xlarge",
    # ── GCP Compute compute optimized ─────────────────────────────────────────
    "c2-standard-4":    "compute-co-large",
    "c2-standard-8":    "compute-co-xlarge",
    "c2-standard-16":   "compute-co-2xl",
    # ── GCP Compute memory optimized ──────────────────────────────────────────
    "m2-ultramem-208":  "compute-mo-2xl",
    "n2-highmem-2":     "compute-mo-medium",
    "n2-highmem-4":     "compute-mo-large",
    "n2-highmem-8":     "compute-mo-xlarge",
    # ── GCP Cloud SQL ─────────────────────────────────────────────────────────
    "db-f1-micro":      "db-xs",
    "db-g1-small":      "db-small",
    "db-n1-standard-1": "db-small",
    "db-n1-standard-2": "db-medium",
    "db-n1-standard-4": "db-large",
    "db-n1-standard-8": "db-xlarge",
    # Cloud SQL high-memory
    "db-n1-highmem-2":  "db-mo-medium",
    "db-n1-highmem-4":  "db-mo-large",
    "db-n1-highmem-8":  "db-mo-xlarge",
    # ── GCP Cloud Storage ─────────────────────────────────────────────────────
    "GCS-Standard":  "storage-standard",
    "GCS-Nearline":  "storage-infrequent",
    "GCS-Coldline":  "storage-archive",
    "GCS-Archive":   "storage-deep-archive",
    # ── GCP Cloud Functions ───────────────────────────────────────────────────
    "GCF-Invocations": "serverless-invocations",
    "GCF-Duration":    "serverless-duration",
    # ── GCP GKE ───────────────────────────────────────────────────────────────
    "GKE-Cluster":          "containers-cluster",
    "GKE-Autopilot-vCPU":   "containers-vcpu",
    "GKE-Autopilot-Memory": "containers-memory",
}


# ─── Spec-based fallback mapping ──────────────────────────────────────────────
# (category_name, vcpus, memory_gb_rounded) → group
# Used for instances not in NAME_TO_GROUP.

_MEMORY_BUCKETS = [0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0, 128.0, 256.0]


def _round_memory(mem: float) -> float:
    """Round memory to the nearest standard bucket."""
    for b in _MEMORY_BUCKETS:
        if mem <= b * 1.25:
            return b
    return round(mem)


SPEC_TO_GROUP: dict[tuple[str, int, float], str] = {
    # Compute general purpose
    ("compute",  2,  0.5): "compute-gp-nano",
    ("compute",  2,  1.0): "compute-gp-nano",
    ("compute",  2,  2.0): "compute-gp-small",
    ("compute",  2,  4.0): "compute-gp-small",
    ("compute",  2,  8.0): "compute-gp-medium",
    ("compute",  4, 16.0): "compute-gp-large",
    ("compute",  8, 32.0): "compute-gp-xlarge",
    ("compute", 16, 64.0): "compute-gp-2xl",
    ("compute", 32,128.0): "compute-gp-4xl",
    # Compute optimized (fewer memory per vCPU)
    ("compute",  2,  4.0): "compute-gp-small",   # overlaps — handled by name first
    ("compute",  4,  8.0): "compute-co-large",
    ("compute",  8, 16.0): "compute-co-xlarge",
    ("compute", 16, 32.0): "compute-co-2xl",
    # Memory optimized (more memory per vCPU)
    ("compute",  2, 16.0): "compute-mo-medium",
    ("compute",  4, 32.0): "compute-mo-large",
    ("compute",  8, 64.0): "compute-mo-xlarge",
    ("compute", 16,128.0): "compute-mo-2xl",
    # Database
    ("database", 2,  1.0): "db-xs",
    ("database", 2,  2.0): "db-small",
    ("database", 2,  4.0): "db-small",
    ("database", 2,  8.0): "db-medium",
    ("database", 2, 16.0): "db-medium",
    ("database", 4, 16.0): "db-large",
    ("database", 4, 32.0): "db-large",
    ("database", 8, 32.0): "db-xlarge",
    ("database", 8, 64.0): "db-xlarge",
    ("database",16, 64.0): "db-2xl",
    ("database",16,128.0): "db-2xl",
    # Azure Flexible Server uses rounded specs
    ("database", 1,  2.0): "db-xs",
    ("database", 2, 10.0): "db-small",
    ("database", 4, 20.0): "db-large",
    ("database", 8, 40.0): "db-xlarge",
    ("database",16, 81.0): "db-2xl",
}


def _get_group_for_instance(it: InstanceType, cat_name: str) -> str | None:
    """Determine equivalent_group for an instance."""
    # 1. Exact name match
    group = NAME_TO_GROUP.get(it.name)
    if group:
        return group

    # 2. Prefix/substring name match for Azure DB flexible servers
    name_lower = it.name.lower()
    if cat_name == "database":
        if "gp_s_gen5" in name_lower or "gp_gen5" in name_lower:
            # e.g. GP_S_Gen5_2 → 2 vCPU → db-small
            parts = it.name.split("_")
            try:
                vcpus = int(parts[-1])
                if vcpus <= 2:
                    return "db-xs"
                elif vcpus <= 4:
                    return "db-small"
                elif vcpus <= 8:
                    return "db-large"
                else:
                    return "db-2xl"
            except (ValueError, IndexError):
                pass

    # 3. Storage / serverless / containers by name pattern
    if cat_name == "storage":
        if "standard" in name_lower or "hot" in name_lower:
            return "storage-standard"
        if "cool" in name_lower or "nearline" in name_lower or "infrequent" in name_lower:
            return "storage-infrequent"
        if "archive" in name_lower or "glacier" in name_lower or "coldline" in name_lower:
            return "storage-archive"
        if "deep" in name_lower:
            return "storage-deep-archive"

    if cat_name == "serverless":
        if "invocation" in name_lower or "request" in name_lower:
            return "serverless-invocations"
        if "duration" in name_lower or "compute" in name_lower:
            return "serverless-duration"

    if cat_name == "containers":
        if "cluster" in name_lower:
            return "containers-cluster"
        if "vcpu" in name_lower:
            return "containers-vcpu"
        if "memory" in name_lower or "mem" in name_lower:
            return "containers-memory"

    # 4. Spec-based fallback
    if it.vcpus and it.memory_gb:
        vcpus = int(it.vcpus)
        mem = _round_memory(float(it.memory_gb))
        group = SPEC_TO_GROUP.get((cat_name, vcpus, mem))
        if group:
            return group

    return None


def main() -> None:
    db = SessionLocal()
    try:
        # Load category names
        cats = {c.id: c.name for c in db.scalars(select(ServiceCategory)).all()}

        instances = db.scalars(select(InstanceType)).all()
        updated = 0
        skipped = 0

        for it in instances:
            cat_name = cats.get(it.service_category_id, "")
            new_group = _get_group_for_instance(it, cat_name)

            if new_group and new_group != it.equivalent_group:
                it.equivalent_group = new_group
                updated += 1
            elif not new_group:
                skipped += 1

        db.commit()
        print(f"[update_equivalent_groups] Updated: {updated}  No-match: {skipped}  Total: {len(instances)}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
