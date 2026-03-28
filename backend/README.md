# Cloud Pricing Simulator — Backend

FastAPI + SQLAlchemy backend for multi-provider cloud pricing data.

## Prerequisites

- Python 3.11+
- Docker (for PostgreSQL)

## Quick start

```bash
# 1. Start PostgreSQL
docker-compose up -d        # from project root

# 2. Install dependencies
cd backend
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env        # edit DATABASE_URL if needed

# 4. Run migrations
alembic upgrade head

# 5. Seed base data (providers, regions, service categories)
python -m app.scripts.seed_providers

# 6. Fetch pricing data (AWS + Azure live APIs, GCP mock)
python -m app.scripts.run_scrapers

# 7. Start the API server
uvicorn app.main:app --reload
```

API available at http://localhost:8000 — Swagger docs at http://localhost:8000/docs

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/providers` | List all providers |
| GET | `/api/providers/{id}/regions` | Regions for a provider |
| GET | `/api/providers/{id}/instance-types?service_category=compute` | Instance types (filterable) |
| GET | `/api/service-categories` | List service categories |
| GET | `/api/pricing?instance_type_id=X&region_id=Y` | Pricing lookup |
| GET | `/api/pricing/compare?equivalent_group=...&region_codes=...` | Cross-provider comparison |
| GET | `/health` | Health check |

## Scrapers

- **AWS** — Uses public bulk pricing JSON (no credentials needed)
- **Azure** — Uses public Retail Prices REST API
- **GCP** — Reads from `app/scrapers/gcp_mock_data.json` (will switch to Cloud Billing Catalog API later)
