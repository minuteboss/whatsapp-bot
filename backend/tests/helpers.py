"""
Shared test helpers — available to all test modules.
"""

from models.agent import Agent
from middleware.auth import create_access_token


def auth_cookie(agent: Agent) -> dict:
    """Generate an auth_token cookie header for a given agent."""
    token = create_access_token({"sub": agent.id, "tenant_id": agent.tenant_id})
    return {"Cookie": f"auth_token={token}"}
