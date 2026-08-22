"""Async engine, session factory, and the FastAPI dependency. Owned by M5."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import get_db_settings

__all__ = ["dispose_engine", "get_engine", "get_session", "get_sessionmaker", "session_scope"]


@lru_cache(maxsize=1)
def get_engine() -> AsyncEngine:
    settings = get_db_settings()
    return create_async_engine(
        settings.async_url,
        echo=settings.DB_ECHO,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE_SECONDS,
        pool_pre_ping=True,
        future=True,
    )


@lru_cache(maxsize=1)
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=get_engine(),
        class_=AsyncSession,
        expire_on_commit=False,  # keep ORM objects usable after the request commits
        autoflush=False,
    )


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency.

    async def endpoint(session: AsyncSession = Depends(get_session)): ...
    """
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    """Same thing for scripts and background tasks, which have no DI container."""
    async with get_sessionmaker()() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    """Close the pool on shutdown so uvicorn --reload does not leak connections."""
    if get_engine.cache_info().currsize:
        await get_engine().dispose()
