/**
 * Shared TypeScript types for the application.
 */

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'agent' | 'superadmin';
  status: 'online' | 'away' | 'offline';
  max_chats: number;
  wa_connected: boolean;
  wa_phone_number: string | null;
  wa_phone_number_id?: string | null;
  wa_connected_at?: string | null;
  api_key?: string;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Conversation {
  id: string;
  channel: 'whatsapp' | 'web_widget';
  status: 'pending' | 'active' | 'resolved';
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  assigned_agent_id: string | null;
  previous_agent_id: string | null;
  transfer_note: string | null;
  source_page: string | null;
  tenant_id?: string;
  wa_session_id?: string | null;
  last_message_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  last_message?: string | null;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'customer' | 'agent' | 'system' | 'bot';
  sender_agent_id: string | null;
  sender_name: string | null;
  content: string;
  content_type: 'text' | 'image' | 'file' | 'system_event';
  wa_message_id: string | null;
  wa_sent_from: 'company' | 'agent_personal' | null;
  delivery_status: 'sent' | 'delivered' | 'read' | 'failed';
  media_url?: string | null;
  created_at: string;
}

export interface CannedResponse {
  id: string;
  shortcut: string;
  title: string;
  content: string;
  created_at?: string;
}

export interface Setting {
  key: string;
  value: string;
}

export interface Stats {
  total: number;
  pending: number;
  active: number;
  resolved: number;
  agents_online: number;
  today_resolved: number;
}

export interface WSEvent {
  type: string;
  [key: string]: any;
}

export type ConversationFilter = 'all' | 'queue' | 'mine' | 'resolved';
