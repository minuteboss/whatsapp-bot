
import sys
import os
import asyncio

# Add current directory to path so we can import local modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from database import async_session
from models import Tenant

async def check_tenants():
    async with async_session() as db:
        result = await db.execute(select(Tenant))
        tenants = result.scalars().all()
        for t in tenants:
            print(f"ID: {t.id}, Name: {t.name}, Slug: {t.slug}, Token: {t.whatsapp_token[:10] if t.whatsapp_token else 'None'}")

if __name__ == "__main__":
    asyncio.run(check_tenants())
