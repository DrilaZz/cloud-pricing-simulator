from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env from the backend directory
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)


class Settings(BaseSettings):
    database_url: str = "postgresql://cloud_pricing:cloud_pricing@localhost:5432/cloud_pricing"

    model_config = {"env_file": str(_env_path), "extra": "ignore"}


settings = Settings()
