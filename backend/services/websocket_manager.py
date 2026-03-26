"""
WebSocket connection manager for agent dashboards.
"""

import json
import logging
from fastapi import WebSocket
from typing import Any

logger = logging.getLogger(__name__)


class WebSocketManager:
    """
    Manages WebSocket connections for agent dashboards and widget clients.
    Maps agent_id → list of WebSocket connections (an agent can have multiple tabs).
    Maps conversation_id → list of WebSocket connections (widget clients).
    """

    def __init__(self):
        # agent_id -> list of WebSocket connections
        self._connections: dict[str, list[WebSocket]] = {}
        # conversation_id -> list of WebSocket connections (widget clients)
        self._widget_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, agent_id: str, ws: WebSocket):
        """Register a new WebSocket connection for an agent."""
        await ws.accept()
        if agent_id not in self._connections:
            self._connections[agent_id] = []
        self._connections[agent_id].append(ws)
        logger.info(f"Agent {agent_id} connected. Total connections: {len(self._connections[agent_id])}")

    def disconnect(self, agent_id: str, ws: WebSocket):
        """Remove a WebSocket connection. Returns True if agent has no more connections."""
        if agent_id in self._connections:
            try:
                self._connections[agent_id].remove(ws)
            except ValueError:
                pass
            if not self._connections[agent_id]:
                del self._connections[agent_id]
                return True  # Agent fully disconnected
        return False

    def is_connected(self, agent_id: str) -> bool:
        """Check if an agent has any active connections."""
        return agent_id in self._connections and len(self._connections[agent_id]) > 0

    def get_connected_agent_ids(self) -> list[str]:
        """Return list of all connected agent IDs."""
        return list(self._connections.keys())

    async def send_to_agent(self, agent_id: str, event: dict):
        """Send an event to a specific agent (all their connections)."""
        if agent_id not in self._connections:
            return
        dead = []
        for ws in self._connections[agent_id]:
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                self._connections[agent_id].remove(ws)
            except ValueError:
                pass
        if agent_id in self._connections and not self._connections[agent_id]:
            del self._connections[agent_id]

    async def broadcast_all(self, event: dict):
        """Broadcast an event to ALL connected agents."""
        dead_agents = []
        for agent_id in list(self._connections.keys()):
            dead = []
            for ws in self._connections[agent_id]:
                try:
                    await ws.send_json(event)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                try:
                    self._connections[agent_id].remove(ws)
                except ValueError:
                    pass
            if not self._connections[agent_id]:
                dead_agents.append(agent_id)
        for agent_id in dead_agents:
            del self._connections[agent_id]

    async def broadcast_except(self, exclude_agent_id: str, event: dict):
        """Broadcast to all agents except one."""
        for agent_id in list(self._connections.keys()):
            if agent_id != exclude_agent_id:
                await self.send_to_agent(agent_id, event)

    # ── Widget connections ────────────────────────────────────

    async def connect_widget(self, conversation_id: str, ws: WebSocket):
        """Register a widget WebSocket connection for a conversation."""
        if conversation_id not in self._widget_connections:
            self._widget_connections[conversation_id] = []
        self._widget_connections[conversation_id].append(ws)
        logger.info(f"Widget connected for conversation {conversation_id}")

    def disconnect_widget(self, conversation_id: str, ws: WebSocket):
        """Remove a widget WebSocket connection."""
        if conversation_id in self._widget_connections:
            try:
                self._widget_connections[conversation_id].remove(ws)
            except ValueError:
                pass
            if not self._widget_connections[conversation_id]:
                del self._widget_connections[conversation_id]

    async def send_to_widget(self, conversation_id: str, event: dict):
        """Send an event to all widget connections for a conversation."""
        if conversation_id not in self._widget_connections:
            return
        dead = []
        for ws in self._widget_connections[conversation_id]:
            try:
                await ws.send_json(event)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                self._widget_connections[conversation_id].remove(ws)
            except ValueError:
                pass
        if conversation_id in self._widget_connections and not self._widget_connections[conversation_id]:
            del self._widget_connections[conversation_id]


# ── Singleton ─────────────────────────────────────────────────
ws_manager = WebSocketManager()
