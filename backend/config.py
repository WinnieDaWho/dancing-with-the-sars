"""Environment configuration. Defaults match docker-compose.yml (local dev)."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://dwts:dwts_local_dev@localhost:5433/dwts"
    api_port: int = 8077
    earthdata_token: str = ""
    cors_origins: list[str] = [
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ]
    worker_poll_seconds: float = 10.0

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
