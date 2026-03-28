FROM python:3.11-slim

WORKDIR /app

# curl for optional healthchecks; no postgres client needed (psycopg2-binary is self-contained)
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x init.sh

EXPOSE 8000

CMD ["./init.sh"]
