from abc import ABC, abstractmethod

from sqlalchemy.orm import Session


class BaseScraper(ABC):
    """Abstract base class for cloud pricing scrapers."""

    def __init__(self, db: Session):
        self.db = db

    @abstractmethod
    def fetch_data(self) -> list[dict]:
        """Fetch raw pricing data from the provider API or file.

        Returns a list of normalised dictionaries ready for save_to_db.
        """

    @abstractmethod
    def normalize_data(self, raw: list[dict]) -> list[dict]:
        """Transform raw API responses into a uniform structure:

        {
            "instance_name": str,
            "service_category": str,        # compute | database | storage
            "vcpus": int | None,
            "memory_gb": float | None,
            "storage_info": str | None,
            "equivalent_group": str | None,
            "region_code": str,
            "price_per_hour_ondemand": float,
            "price_per_hour_reserved_1y": float | None,
            "price_per_hour_reserved_3y": float | None,
            "currency": str,
        }
        """

    @abstractmethod
    def save_to_db(self, records: list[dict]) -> int:
        """Upsert normalised records into the database.

        Returns the number of records written.
        """

    def run(self) -> int:
        """Execute the full scrape pipeline."""
        raw = self.fetch_data()
        records = self.normalize_data(raw)
        count = self.save_to_db(records)
        return count
