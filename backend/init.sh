#!/bin/bash
set -e

echo "=== [1/5] Waiting for PostgreSQL ==="
python3 - <<'PYEOF'
import sys, time, os
import psycopg2

url = os.environ.get("DATABASE_URL", "")
if not url:
    print("ERROR: DATABASE_URL is not set"); sys.exit(1)

for i in range(30):
    try:
        conn = psycopg2.connect(url)
        conn.close()
        print("PostgreSQL is ready.")
        sys.exit(0)
    except Exception as e:
        print(f"  Retry {i+1}/30: {e}")
        time.sleep(2)

print("ERROR: PostgreSQL did not become ready in time.")
sys.exit(1)
PYEOF

echo "=== [2/5] Running Alembic migrations ==="
alembic upgrade head

echo "=== [3/5] Seeding providers, regions and service categories ==="
python -m app.scripts.seed_providers

echo "=== [4/5] Seeding default templates ==="
python -m app.scripts.seed_templates

echo "=== [5/5] Loading pricing data from JSON files ==="
python -m app.scripts.run_scrapers --skip-if-exists

echo "=== Starting uvicorn ==="
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
