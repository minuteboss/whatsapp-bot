"""add_tenant_api_key

Revision ID: f3e2d46472cb
Revises:
Create Date: 2026-03-25 18:43:59.850129

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3e2d46472cb'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('api_key', sa.String(length=120), nullable=True))
    op.create_unique_constraint('uq_tenants_api_key', 'tenants', ['api_key'])


def downgrade() -> None:
    op.drop_constraint('uq_tenants_api_key', 'tenants', type_='unique')
    op.drop_column('tenants', 'api_key')
