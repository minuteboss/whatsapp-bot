"""
SQLAlchemy 2.0 async engine + session factory.
"""

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from config import settings


# ── Engine ────────────────────────────────────────────────────
# Detect driver and create appropriate engine
db_url = settings.DATABASE_URL

# For SQLite fallback (dev)
if "sqlite" in db_url:
    engine = create_async_engine(db_url, echo=False)
else:
    engine = create_async_engine(
        db_url,
        echo=False,
        pool_size=10,
        max_overflow=20,
    )

# ── Session factory ───────────────────────────────────────────
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── Base class ────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── FastAPI dependency ────────────────────────────────────────
async def get_db():
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
