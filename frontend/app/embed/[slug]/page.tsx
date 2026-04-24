'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface StarterField {
  label: string;
  key: string;
  required: boolean;
  type: 'text' | 'email' | 'phone' | 'select' | 'checkbox' | 'textarea' | 'radio';
  options?: string[];
  conditional?: Array<{ trigger_value: string; follow_up: StarterField }>;
}

interface TenantConfig {
  name: string;
  greeting: string;
  starter_enabled: boolean;
  starter_fields: StarterField[];
  starter_greeting: string;
  offline_collect_email: boolean;
  away_message: string;
  widget_primary_color: string;
  widget_title: string;
  widget_subtitle: string;
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
        if (event.type === 'message:new' && event.message) {
          setMessages(prev => {
            if (prev.find(m => m.id === event.message.id)) return prev;
            return [...prev, event.message];
          });
        }
        if (event.type === 'conversation:resolved') {
          setMessages(prev => [...prev, {
            id: `sys_${Date.now()}`,
            sender_type: 'system',
            sender_name: null,
            content: 'This conversation has been resolved. Thank you!',
            created_at: new Date().toISOString(),
          }]);
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

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isSending) return;

    const text = input.trim();
    setInput('');
    setIsSending(true);

    let activeConvId = conversationId;

    // If no conversation yet, start one now
    if (!activeConvId) {
      try {
        const res = await fetch(`${API_URL}/api/v1/widget/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, key: widgetKey, fields: starterData }),
        });
        if (!res.ok) throw new Error('Failed to start conversation');
        const data = await res.json();
        activeConvId = data.conversation_id;
        setConversationId(activeConvId);
        if (data.messages) setMessages(data.messages);
      } catch (err: any) {
        setError(err.message || 'Failed to start chat');
        setIsSending(false);
        return;
      }
    }

    const tempId = `tmp_${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, sender_type: 'customer', sender_name: starterData.name || 'You',
      content: text, created_at: new Date().toISOString(),
    }]);

    try {
      await fetch(`${API_URL}/api/v1/widget/conversations/${activeConvId}/messages`, {
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

  const accentColor = config.widget_primary_color || '#2563eb';

  return (
    <div className="h-screen flex flex-col bg-white font-sans text-sm">
      {/* Header */}
      <div className="px-4 py-3 flex items-center space-x-3 text-white flex-shrink-0" style={{ background: accentColor }}>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
          {config.widget_title.charAt(0)}
        </div>
        <div>
          <p className="font-semibold text-sm">{config.widget_title}</p>
          <p className="text-[10px] opacity-80">{config.widget_subtitle}</p>
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
              <FieldRenderer
                key={field.key}
                field={field}
                value={starterData[field.key] || ''}
                onChange={(v) => setStarterData(p => ({ ...p, [field.key]: v }))}
                allData={starterData}
                onChangeAll={setStarterData}
                accentColor={accentColor}
              />
            ))}
            <button type="submit" disabled={isStarting}
              className="w-full py-2.5 text-white text-sm font-semibold rounded-lg cursor-pointer"
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
              <div key={msg.id} className={`flex ${msg.sender_type === 'customer' ? 'justify-end' : msg.sender_type === 'system' ? 'justify-center' : 'justify-start'}`}>
                {msg.sender_type === 'system' ? (
                  <span className="px-3 py-1 text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full">
                    {msg.content}
                  </span>
                ) : (
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
                )}
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} className="px-3 py-2.5 border-t border-gray-100 flex items-center gap-2 bg-white flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type a message…"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-full outline-none focus:border-blue-400"
              style={{ caretColor: accentColor }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity cursor-pointer"
              style={{ background: accentColor, opacity: !input.trim() || isSending ? 0.4 : 1 }}
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </>
      )}
    </div>
  );
}


/* ── Field Renderer for advanced types ─────────────────────── */

function FieldRenderer({
  field,
  value,
  onChange,
  allData,
  onChangeAll,
  accentColor,
}: {
  field: StarterField;
  value: string;
  onChange: (v: string) => void;
  allData: Record<string, string>;
  onChangeAll: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  accentColor: string;
}) {
  const inputClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400';

  // Find active conditional follow-up
  const activeConditional = (field.conditional || []).find(c => c.trigger_value === value);

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      {/* text / email / phone */}
      {(field.type === 'text' || field.type === 'email' || field.type === 'phone') && (
        <input
          type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
          required={field.required}
          pattern={field.type === 'phone' ? "[0-9+]*" : undefined}
          value={value}
          onChange={e => {
            let val = e.target.value;
            if (field.type === 'phone') {
              val = val.replace(/[^0-9+]/g, '');
              val = val.startsWith('+') ? '+' + val.slice(1).replace(/\+/g, '') : val.replace(/\+/g, '');
            }
            onChange(val);
          }}
          className={inputClass}
          placeholder={field.label}
        />
      )}

      {/* textarea */}
      {field.type === 'textarea' && (
        <textarea
          required={field.required}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={inputClass + ' resize-none h-20'}
          placeholder={field.label}
        />
      )}

      {/* select (dropdown) */}
      {field.type === 'select' && (
        <select
          required={field.required}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={inputClass + ' cursor-pointer'}
        >
          <option value="">Select...</option>
          {(field.options || []).map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {/* radio */}
      {field.type === 'radio' && (
        <div className="flex flex-wrap gap-2 mt-1">
          {(field.options || []).map(opt => (
            <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
              <input
                type="radio"
                name={field.key}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                required={field.required && !value}
                style={{ accentColor }}
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {/* checkbox */}
      {field.type === 'checkbox' && (
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 mt-1">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={e => onChange(e.target.checked ? 'true' : '')}
            style={{ accentColor }}
          />
          {field.label}
        </label>
      )}

      {/* Conditional follow-up field */}
      {activeConditional && activeConditional.follow_up && (
        <div className="mt-2 pl-3" style={{ borderLeft: `2px solid ${accentColor}` }}>
          <FieldRenderer
            field={{ ...activeConditional.follow_up, type: activeConditional.follow_up.type || 'text' }}
            value={allData[activeConditional.follow_up.key] || ''}
            onChange={(v) => onChangeAll(p => ({ ...p, [activeConditional.follow_up.key]: v }))}
            allData={allData}
            onChangeAll={onChangeAll}
            accentColor={accentColor}
          />
        </div>
      )}
    </div>
  );
}
