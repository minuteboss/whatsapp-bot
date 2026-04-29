import logging
from sqlalchemy import select
from models.setting import Setting
from database import async_session

logger = logging.getLogger(__name__)

class SettingService:
    def __init__(self):
        self._cache = {}
        self._loaded = False

    async def reload_cache(self):
        """Loads all global settings into memory."""
        try:
            async with async_session() as db:
                result = await db.execute(select(Setting).where(Setting.tenant_id == None))
                settings = result.scalars().all()
                self._cache = {s.key: s.value for s in settings}
                self._loaded = True
        except Exception as e:
            logger.error(f"Failed to load global settings: {e}")

    def get(self, key: str, default: str = None) -> str | None:
        """Get setting synchronously from cache. Use default if not found."""
        return self._cache.get(key, default)

    async def get_async(self, key: str, default: str = None) -> str | None:
        """Get setting asynchronously, reloading cache if needed."""
        if not self._loaded:
            await self.reload_cache()
        return self._cache.get(key, default)

    async def set(self, key: str, value: str):
        """Set a global setting in DB and update cache."""
        async with async_session() as db:
            result = await db.execute(
                select(Setting).where(Setting.key == key, Setting.tenant_id == None)
            )
            setting = result.scalar_one_or_none()
            if setting:
                setting.value = value
            else:
                setting = Setting(key=key, value=value, tenant_id=None)
                db.add(setting)
            await db.commit()
        
        self._cache[key] = value

global_settings = SettingService()
