/**
 * App-wide context: agent session, conversations state, WS event handling.
 * Auth is cookie-based — no token in state.
 */

'use client';

import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { Agent, Conversation, Message, CannedResponse, WSEvent, ConversationFilter } from '@/lib/types';

// ── State ────────────────────────────────────────────────────
interface TypingEntry { name: string; ts: number }

interface AppState {
  agent: Agent | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  hasMoreMessages: boolean;
  nextCursor: string | null;
  agents: Agent[];
  cannedResponses: CannedResponse[];
  pendingCount: number;
  filter: ConversationFilter;
  wsConnected: boolean;
  /** conversationId → who is typing */
  typing: Record<string, TypingEntry>;
}

const initialState: AppState = {
  agent: null,
  conversations: [],
  activeConversationId: null,
  messages: [],
  hasMoreMessages: false,
  nextCursor: null,
  agents: [],
  cannedResponses: [],
  pendingCount: 0,
  filter: 'all',
  wsConnected: false,
  typing: {},
};

// ── Actions ──────────────────────────────────────────────────
type Action =
  | { type: 'SET_AGENT'; agent: Agent }
  | { type: 'LOGOUT' }
  | { type: 'SET_CONVERSATIONS'; conversations: Conversation[] }
  | { type: 'UPDATE_CONVERSATION'; conversation: Conversation }
  | { type: 'SET_ACTIVE_CONVERSATION'; id: string | null }
  | { type: 'SET_MESSAGES'; messages: Message[]; hasMore?: boolean; nextCursor?: string | null }
  | { type: 'PREPEND_MESSAGES'; messages: Message[]; hasMore?: boolean; nextCursor?: string | null }
  | { type: 'ADD_MESSAGE'; message: Message }
  | { type: 'UPDATE_MESSAGE_STATUS'; wa_message_id: string; status: string }
  | { type: 'SET_AGENTS'; agents: Agent[] }
  | { type: 'UPDATE_AGENT_STATUS'; agent_id: string; status: string }
  | { type: 'SET_CANNED'; cannedResponses: CannedResponse[] }
  | { type: 'SET_PENDING_COUNT'; count: number }
  | { type: 'SET_FILTER'; filter: ConversationFilter }
  | { type: 'SET_WS_CONNECTED'; connected: boolean }
  | { type: 'SET_TYPING'; conversationId: string; name: string }
  | { type: 'CLEAR_TYPING'; conversationId: string };

function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_AGENT':
      return { ...state, agent: action.agent };
    case 'LOGOUT':
      return { ...initialState };
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations };
    case 'UPDATE_CONVERSATION': {
      const idx = state.conversations.findIndex(c => c.id === action.conversation.id);
      if (idx >= 0) {
        const updated = [...state.conversations];
        updated[idx] = { ...updated[idx], ...action.conversation };
        return { ...state, conversations: updated };
      }
      return { ...state, conversations: [action.conversation, ...state.conversations] };
    }
    case 'SET_ACTIVE_CONVERSATION':
      return { ...state, activeConversationId: action.id };
    case 'SET_MESSAGES':
      return {
        ...state,
        messages: action.messages,
        hasMoreMessages: action.hasMore ?? false,
        nextCursor: action.nextCursor ?? null,
      };
    case 'PREPEND_MESSAGES':
      return {
        ...state,
        messages: [...action.messages, ...state.messages],
        hasMoreMessages: action.hasMore ?? false,
        nextCursor: action.nextCursor ?? null,
      };
    case 'ADD_MESSAGE': {
      if (action.message.conversation_id === state.activeConversationId) {
        const exists = state.messages.some(m => m.id === action.message.id);
        if (!exists) {
          // Clear typing when message arrives
          const typing = { ...state.typing };
          delete typing[action.message.conversation_id];
          return { ...state, messages: [...state.messages, action.message], typing };
        }
      }
      return state;
    }
    case 'UPDATE_MESSAGE_STATUS': {
      const msgs = state.messages.map(m =>
        m.wa_message_id === action.wa_message_id
          ? { ...m, delivery_status: action.status as Message['delivery_status'] }
          : m
      );
      return { ...state, messages: msgs };
    }
    case 'SET_AGENTS':
      return { ...state, agents: action.agents };
    case 'UPDATE_AGENT_STATUS': {
      const agentsList = state.agents.map(a =>
        a.id === action.agent_id ? { ...a, status: action.status as Agent['status'] } : a
      );
      return { ...state, agents: agentsList };
    }
    case 'SET_CANNED':
      return { ...state, cannedResponses: action.cannedResponses };
    case 'SET_PENDING_COUNT':
      return { ...state, pendingCount: action.count };
    case 'SET_FILTER':
      return { ...state, filter: action.filter };
    case 'SET_WS_CONNECTED':
      return { ...state, wsConnected: action.connected };
    case 'SET_TYPING':
      return {
        ...state,
        typing: { ...state.typing, [action.conversationId]: { name: action.name, ts: Date.now() } },
      };
    case 'CLEAR_TYPING': {
      const t = { ...state.typing };
      delete t[action.conversationId];
      return { ...state, typing: t };
    }
    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  handleWSEvent: (event: WSEvent) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const handleWSEvent = useCallback((event: WSEvent) => {
    switch (event.type) {
      case 'conversation:new':
      case 'conversation:assigned':
      case 'conversation:transferred':
      case 'conversation:resolved':
        dispatch({ type: 'UPDATE_CONVERSATION', conversation: event.conversation });
        break;
      case 'message:new':
      case 'wa:reply_received':
        dispatch({ type: 'ADD_MESSAGE', message: event.message });
        dispatch({ type: 'UPDATE_CONVERSATION', conversation: event.conversation });
        break;
      case 'message:status':
        dispatch({ type: 'UPDATE_MESSAGE_STATUS', wa_message_id: event.wa_message_id, status: event.status });
        break;
      case 'agent:status':
        dispatch({ type: 'UPDATE_AGENT_STATUS', agent_id: event.agent_id, status: event.status });
        break;
      case 'queue:update':
        dispatch({ type: 'SET_PENDING_COUNT', count: event.count });
        break;
      case 'auth:success':
        dispatch({ type: 'SET_WS_CONNECTED', connected: true });
        break;
      case 'typing':
        if (event.conversation_id) {
          dispatch({ type: 'SET_TYPING', conversationId: event.conversation_id, name: event.agent_name || 'Agent' });
        }
        break;
    }
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, handleWSEvent }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
