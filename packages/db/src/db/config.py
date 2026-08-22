"""Database settings. Owned by M5."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class DbSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://urbantwin:urbantwin@localhost:5432/urbantwin"
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_RECYCLE_SECONDS: int = 1800

    @property
    def sync_url(self) -> str:
        """Alembic runs sync in some setups and psycopg2 handles DDL fine."""
        return self.DATABASE_URL.replace("+asyncpg", "+psycopg2")

    @property
    def async_url(self) -> str:
        url = self.DATABASE_URL
        if "+" not in url.split("://", 1)[0]:
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache(maxsize=1)
def get_db_settings() -> DbSettings:
    return DbSettings()
