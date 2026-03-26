'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface StarterField { label: string; key: string; required: boolean }

interface TenantConfig {
  name: string;
  greeting: string;
  starter_enabled: boolean;
  starter_fields: StarterField[];
  starter_greeting: string;
  offline_collect_email: boolean;
  away_message: string;
}

interface Message {
  id: string;
  sender_type: 'customer' | 'agent' | 'system' | 'bot';
  sender_name: string | null;
  content: string;
  created_at: string;
}

export default function EmbedPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const widgetKey = searchParams?.get('key') || '';

  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | 'chat'>('form');
  const [starterData, setStarterData] = useState<Record<string, string>>({});
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Load tenant config
  useEffect(() => {
    if (!slug || !widgetKey) { setError('Invalid embed configuration.'); return; }
    fetch(`${API_URL}/api/v1/widget/config/${slug}?key=${widgetKey}`)
      .then(r => r.ok ? r.json() : Promise.reject('Invalid key'))
      .then(data => {
        setConfig(data);
        if (!data.starter_enabled) setStep('chat');
      })
      .catch(() => setError('Unable to load chat widget. Please check your configuration.'));
  }, [slug, widgetKey]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Connect WS when conversation starts
  useEffect(() => {
    if (!conversationId) return;
    const wsUrl = `${API_URL.replace('http', 'ws')}/ws/widget/${conversationId}?key=${widgetKey}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === 'new_message' && event.message) {
          setMessages(prev => {
            if (prev.find(m => m.id === event.message.id)) return prev;
            return [...prev, event.message];
          });
        }
      } catch { /* ignore */ }
    };
    return () => { ws.close(); };
  }, [conversationId, widgetKey]);

  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsStarting(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/widget/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, key: widgetKey, fields: starterData }),
      });
      if (!res.ok) throw new Error('Failed to start conversation');
      const data = await res.json();
      setConversationId(data.conversation_id);
      if (data.messages) setMessages(data.messages);
      setStep('chat');
    } catch (err: any) {
      setError(err.message || 'Failed to start chat');
    } finally {
      setIsStarting(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !conversationId || isSending) return;
    const text = input.trim();
    setInput('');
    setIsSending(true);
    const tempId = `tmp_${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, sender_type: 'customer', sender_name: starterData.name || 'You',
      content: text, created_at: new Date().toISOString(),
    }]);
    try {
      await fetch(`${API_URL}/api/v1/widget/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': widgetKey },
        body: JSON.stringify({ content: text }),
      });
    } catch {
      // message already shown optimistically
    } finally {
      setIsSending(false);
    }
  };

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center space-y-2">
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const accentColor = '#2563eb';

  return (
    <div className="h-screen flex flex-col bg-white font-sans text-sm">
      {/* Header */}
      <div className="px-4 py-3 flex items-center space-x-3 text-white flex-shrink-0" style={{ background: accentColor }}>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
          {config.name.charAt(0)}
        </div>
        <div>
          <p className="font-semibold text-sm">{config.name}</p>
          <p className="text-[10px] opacity-80">Support Chat</p>
        </div>
      </div>

      {/* Pre-chat form */}
      {step === 'form' && (
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-gray-600 mb-4 leading-relaxed">
            {config.starter_greeting || `Hi! Fill in your details to get started.`}
          </p>
          <form onSubmit={handleStartChat} className="space-y-3">
            {config.starter_fields.map(field => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <input
                  type={field.key === 'email' ? 'email' : 'text'}
                  required={field.required}
                  value={starterData[field.key] || ''}
                  onChange={e => setStarterData(p => ({ ...p, [field.key]: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400"
                  placeholder={field.label}
                />
              </div>
            ))}
            <button type="submit" disabled={isStarting}
              className="w-full py-2.5 text-white text-sm font-semibold rounded-lg"
              style={{ background: accentColor, opacity: isStarting ? 0.7 : 1 }}>
              {isStarting ? 'Starting…' : 'Start Chat'}
            </button>
          </form>
        </div>
      )}

      {/* Chat */}
      {step === 'chat' && (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center py-8 text-xs text-gray-400">
                {config.greeting || 'Say hello to get started!'}
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_type === 'customer' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className="max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
                  style={{
                    background: msg.sender_type === 'customer' ? accentColor : '#fff',
                    color: msg.sender_type === 'customer' ? '#fff' : '#1f2937',
                    borderBottomRightRadius: msg.sender_type === 'customer' ? '4px' : undefined,
                    borderBottomLeftRadius: msg.sender_type !== 'customer' ? '4px' : undefined,
                    boxShadow: msg.sender_type !== 'customer' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {msg.sender_type === 'agent' && msg.sender_name && (
                    <p className="text-[10px] font-semibold mb-0.5 opacity-60">{msg.sender_name}</p>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}
          </div>

          <div className="px-3 py-2.5 border-t border-gray-100 flex items-center gap-2 bg-white flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Type a message…"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-full outline-none focus:border-blue-400"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity"
              style={{ background: accentColor, opacity: !input.trim() || isSending ? 0.4 : 1 }}
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
