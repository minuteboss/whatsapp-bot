
import sys
import os
import asyncio
import secrets
import random
import uuid
from datetime import datetime, timezone, timedelta

# Add current directory to path so we can import local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import async_session, engine
from models import Tenant, Agent, Contact, Template, Conversation, Message, Setting
from middleware.auth import hash_password

async def seed_large_data():
    async with async_session() as db:
        print("Starting large scale seeding...")
        
        # 1. Generate 20 Parent Tenants
        parents = []
        for i in range(1, 21):
            name = f"Enterprise {chr(64+i)}"
            slug = f"enterprise-{i}"
            tenant = Tenant(
                name=name,
                slug=slug,
                max_agents=100,
                max_chats_per_agent=20,
                widget_api_key=f"wk_parent_{secrets.token_hex(16)}",
                api_key=f"sk_parent_{secrets.token_hex(24)}"
            )
            db.add(tenant)
            parents.append(tenant)
        
        await db.flush()
        print(f"Created {len(parents)} Parent Tenants.")

        # 2. Generate 5 Sub-Tenants per Parent
        all_tenants = list(parents)
        for parent in parents:
            for j in range(1, 6):
                name = f"{parent.name} - Branch {j}"
                slug = f"{parent.slug}-br-{j}"
                sub = Tenant(
                    name=name,
                    slug=slug,
                    parent_id=parent.id,
                    max_agents=10,
                    max_chats_per_agent=10,
                    widget_api_key=f"wk_sub_{secrets.token_hex(16)}",
                    api_key=f"sk_sub_{secrets.token_hex(24)}"
                )
                db.add(sub)
                all_tenants.append(sub)
        
        await db.flush()
        print(f"Created {len(all_tenants) - len(parents)} Sub-Tenants (Total Tenants: {len(all_tenants)}).")

        # 3. Create Admin Agents for EVERY Tenant
        # Password for all will be 'agent123'
        pwd_hash = hash_password("agent123")
        for idx, tenant in enumerate(all_tenants):
            admin = Agent(
                name=f"{tenant.name} Admin",
                email=f"admin@{tenant.slug}.com",
                password_hash=pwd_hash,
                role="admin",
                tenant_id=tenant.id,
                api_key=f"sk_agent_{secrets.token_hex(16)}"
            )
            db.add(admin)
            
            # 4. Create 20 Contacts per Tenant
            for k in range(1, 21):
                contact = Contact(
                    name=f"Customer {idx}-{k}",
                    phone=f"+{random.randint(1000000000, 9999999999)}",
                    email=f"customer{idx}_{k}@gmail.com",
                    tenant_id=tenant.id,
                    tags="lead,priority" if k % 5 == 0 else "regular"
                )
                db.add(contact)
            
            # 5. Create 3 Templates per Tenant
            templates = [
                Template(
                    name="Welcome",
                    category="MARKETING",
                    language="en_US",
                    status="APPROVED",
                    components=[{"type": "BODY", "text": "Welcome to our support!"}],
                    tenant_id=tenant.id
                ),
                Template(
                    name="Order Update",
                    category="UTILITY",
                    language="en_US",
                    status="APPROVED",
                    components=[{"type": "BODY", "text": "Your order #{{1}} is processing."}],
                    tenant_id=tenant.id
                ),
                Template(
                    name="Follow Up",
                    category="MARKETING",
                    language="en_US",
                    status="APPROVED",
                    components=[{"type": "BODY", "text": "How was your experience?"}],
                    tenant_id=tenant.id
                )
            ]
            for t in templates:
                db.add(t)

            # 6. Create 5 Sample Conversations per Tenant
            for c_idx in range(1, 6):
                conv = Conversation(
                    tenant_id=tenant.id,
                    channel="whatsapp",
                    status="pending" if c_idx % 2 == 0 else "open",
                    customer_name=f"Chat User {idx}-{c_idx}",
                    customer_phone=f"+{random.randint(111111111, 999999999)}",
                    last_message_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=random.randint(0, 48))
                )
                db.add(conv)
                await db.flush() # need ID for messages
                
                # 7. Add 2 Messages per Conversation
                m1 = Message(
                    conversation_id=conv.id,
                    tenant_id=tenant.id,
                    sender_type="customer",
                    content=f"Hello from user {c_idx}!",
                    content_type="text"
                )
                m2 = Message(
                    conversation_id=conv.id,
                    tenant_id=tenant.id,
                    sender_type="system",
                    content="An agent will be with you shortly.",
                    content_type="text"
                )
                db.add(m1)
                db.add(m2)

        print("Committing to database (this may take a moment)...")
        await db.commit()
        print("Success! Large scale seeding complete.")

if __name__ == "__main__":
    asyncio.run(seed_large_data())
