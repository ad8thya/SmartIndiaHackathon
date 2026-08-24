"""Shared FastAPI dependencies. Owned by M5."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from db import get_session as _db_session
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .config import ApiSettings, get_api_settings
from .hub import Broadcaster, LiveState, broadcaster, state


async def get_db() -> AsyncIterator[AsyncSession]:
    """Postgres session. Endpoints that can degrade gracefully should catch
    OperationalError rather than depending on this — the demo must survive a
    database that is still starting up."""
    async for session in _db_session():
        yield session


def get_state() -> LiveState:
    return state


def get_broadcaster() -> Broadcaster:
    return broadcaster


def get_settings() -> ApiSettings:
    return get_api_settings()


DbSession = Annotated[AsyncSession, Depends(get_db)]
State = Annotated[LiveState, Depends(get_state)]
Bus = Annotated[Broadcaster, Depends(get_broadcaster)]
Settings = Annotated[ApiSettings, Depends(get_settings)]
