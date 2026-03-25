import asyncio
from sqlalchemy import select
from database import async_session
from models.tenant import Tenant
from models.agent import Agent

async def fix():
    async with async_session() as db:
        # Check if default tenant exists
        result = await db.execute(select(Tenant).where(Tenant.slug == "default"))
        tenant = result.scalar_one_or_none()
        
        if not tenant:
            print("Creating default tenant...")
            tenant = Tenant(
                name="Default Company",
                slug="default",
                is_active=True,
                plan="free"
            )
            db.add(tenant)
            await db.flush()
        
        # Link all agents to this tenant
        result = await db.execute(select(Agent))
        agents = result.scalars().all()
        for agent in agents:
            if not agent.tenant_id:
                print(f"Assigning agent {agent.email} to default tenant.")
                agent.tenant_id = tenant.id
        
        await db.commit()
        print("Database fix completed successfully.")

if __name__ == "__main__":
    asyncio.run(fix())
