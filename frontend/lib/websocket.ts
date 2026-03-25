/**
 * WebSocket hook with auto-reconnect and ticket-based auth.
 * Uses /api/v1/auth/ws-ticket to get a short-lived ticket for WS authentication.
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { WSEvent } from './types';
import { authApi } from './api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
const RECONNECT_DELAY = 3000;

interface UseWebSocketOptions {
  enabled: boolean;
  onEvent: (event: WSEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocket({ enabled, onEvent, onConnect, onDisconnect }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountedRef = useRef(false);

  const connect = useCallback(async () => {
    if (!enabled || isUnmountedRef.current) return;

    try {
      // Get a short-lived WS ticket via the cookie-authenticated API
      const { ticket } = await authApi.wsTicket();

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send auth frame with ticket
        ws.send(JSON.stringify({ type: 'auth', ticket }));
      };

      ws.onmessage = (event) => {
        try {
          const data: WSEvent = JSON.parse(event.data);
          if (data.type === 'auth:success') {
            onConnect?.();
          } else if (data.type === 'auth:error') {
            console.error('WebSocket auth failed:', data.detail);
            ws.close();
            return;
          }
          onEvent(data);
        } catch (e) {
          console.error('Failed to parse WS message:', e);
        }
      };

      ws.onclose = () => {
        onDisconnect?.();
        if (!isUnmountedRef.current) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (e) {
      console.error('WebSocket connection error:', e);
      if (!isUnmountedRef.current) {
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
      }
    }
  }, [enabled, onEvent, onConnect, onDisconnect]);

  const sendTyping = useCallback((conversationId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'typing', conversation_id: conversationId }));
    }
  }, []);

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { sendTyping };
}
