
import asyncio
from sqlalchemy import select
from database import engine, Base, async_session
from models import Agent, Setting, CannedResponse
from middleware.auth import hash_password
import secrets

async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async with async_session() as db:
        result = await db.execute(select(Agent).limit(1))
        if result.scalar_one_or_none() is not None:
            print("Already seeded")
            return

        from models.tenant import Tenant
        default_tenant = Tenant(
            name="Default Company",
            slug="default",
            is_active=True,
            plan="free"
        )
        db.add(default_tenant)
        await db.flush()

        api_key = f"sk_{secrets.token_hex(32)}"
        admin_agent = Agent(
            name="Admin",
            email="admin@example.com",
            password_hash=hash_password("admin123"),
            role="admin",
            status="offline",
            max_chats=10,
            api_key=api_key,
            tenant_id=default_tenant.id,
        )
        db.add(admin_agent)
        await db.commit()
        print("Seed success")

if __name__ == "__main__":
    asyncio.run(seed())
