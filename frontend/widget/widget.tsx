import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// ── Types ────────────────────────────────────────────────────
interface Message {
  id: string;
  sender_type: 'customer' | 'agent' | 'system';
  content: string;
  created_at: string;
}

// ── Config (set during initialization from script tag data attributes) ──
let API_URL = 'http://localhost:8000';
let API_KEY = '';

// ── Styles ────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  .wa-widget-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .wa-launcher {
    width: 56px;
    height: 56px;
    background: #2563EB;
    border-radius: 16px;
    box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    border: none;
    outline: none;
  }
  .wa-launcher:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 24px rgba(37, 99, 235, 0.45);
  }
  .wa-launcher svg {
    width: 26px;
    height: 26px;
    color: white;
  }

  .wa-chat-window {
    position: absolute;
    bottom: 72px;
    right: 0;
    width: 380px;
    height: 560px;
    background: #FFFFFF;
    border-radius: 16px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: wa-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes wa-slide-up {
    from { opacity: 0; transform: translateY(12px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .wa-header {
    padding: 20px 24px;
    background: #2563EB;
    color: white;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .wa-header-title {
    font-weight: 700;
    font-size: 15px;
    letter-spacing: -0.01em;
  }
  .wa-header-subtitle {
    font-size: 11px;
    opacity: 0.8;
    margin-top: 2px;
    font-weight: 400;
  }
  .wa-close-btn {
    background: rgba(255,255,255,0.15);
    border: none;
    border-radius: 8px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s;
  }
  .wa-close-btn:hover { background: rgba(255,255,255,0.25); }
  .wa-close-btn svg { width: 16px; height: 16px; color: white; }

  .wa-body {
    flex: 1;
    background: #F8FAFC;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .wa-form {
    padding: 28px 24px;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .wa-form h4 {
    margin: 0 0 8px;
    color: #0F172A;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  .wa-form p {
    margin: 0 0 24px;
    font-size: 13px;
    color: #64748B;
    line-height: 1.5;
  }
  .wa-form form {
    display: grid;
    gap: 12px;
  }
  .wa-input {
    padding: 12px 16px;
    border: 1px solid #E2E8F0;
    border-radius: 10px;
    outline: none;
    font-size: 14px;
    font-family: inherit;
    color: #0F172A;
    background: white;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .wa-input:focus {
    border-color: #2563EB;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
  .wa-input::placeholder { color: #94A3B8; }

  .wa-submit-btn {
    padding: 12px 16px;
    background: #2563EB;
    color: white;
    border: none;
    border-radius: 10px;
    font-weight: 600;
    font-size: 14px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.2s, box-shadow 0.2s;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
  }
  .wa-submit-btn:hover { background: #1D4ED8; }
  .wa-submit-btn:disabled {
    background: #94A3B8;
    cursor: not-allowed;
    box-shadow: none;
  }

  .wa-messages {
    flex: 1;
    padding: 16px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .wa-messages::-webkit-scrollbar { width: 4px; }
  .wa-messages::-webkit-scrollbar-track { background: transparent; }
  .wa-messages::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }

  .wa-msg {
    padding: 10px 14px;
    border-radius: 12px;
    max-width: 85%;
    font-size: 13px;
    line-height: 1.5;
    word-wrap: break-word;
  }
  .wa-msg-customer {
    align-self: flex-end;
    background: #2563EB;
    color: white;
    border-bottom-right-radius: 4px;
  }
  .wa-msg-agent {
    align-self: flex-start;
    background: white;
    color: #0F172A;
    border: 1px solid #E2E8F0;
    border-bottom-left-radius: 4px;
  }
  .wa-msg-system {
    align-self: center;
    background: transparent;
    color: #94A3B8;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .wa-reply-bar {
    padding: 12px 16px;
    background: white;
    border-top: 1px solid #F1F5F9;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .wa-reply-input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid #E2E8F0;
    border-radius: 24px;
    outline: none;
    font-size: 13px;
    font-family: inherit;
    color: #0F172A;
    background: #F8FAFC;
    transition: border-color 0.2s;
  }
  .wa-reply-input:focus {
    border-color: #2563EB;
    background: white;
  }
  .wa-reply-input::placeholder { color: #94A3B8; }

  .wa-send-btn {
    width: 36px;
    height: 36px;
    background: #2563EB;
    border: none;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s, box-shadow 0.2s;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.2);
    flex-shrink: 0;
  }
  .wa-send-btn:hover { background: #1D4ED8; }
  .wa-send-btn:disabled { background: #CBD5E1; box-shadow: none; cursor: default; }
  .wa-send-btn svg { width: 16px; height: 16px; color: white; fill: currentColor; }

  .wa-powered {
    text-align: center;
    padding: 8px;
    font-size: 10px;
    color: #94A3B8;
    background: white;
    border-top: 1px solid #F1F5F9;
  }

  .wa-typing {
    display: flex;
    gap: 4px;
    padding: 10px 14px;
    align-self: flex-start;
  }
  .wa-typing-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #CBD5E1;
    animation: wa-bounce 1.4s infinite;
  }
  .wa-typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .wa-typing-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes wa-bounce {
    0%, 80%, 100% { transform: scale(0.6); }
    40% { transform: scale(1); }
  }
`;

// ── Widget Component ─────────────────────────────────────────
const Widget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<'form' | 'chat'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Determine slug from script tag or current URL if embed
    const script = document.currentScript || document.querySelector('script[data-key]');
    const slug = script?.getAttribute('data-slug') || window.location.pathname.split('/').pop();
    if (slug && API_KEY) {
      fetch(`${API_URL}/api/v1/widget/config/${slug}?key=${API_KEY}`)
        .then(r => r.json())
        .then(setConfig)
        .catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Polling for new messages
  useEffect(() => {
    if (state === 'chat' && conversationId) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/v1/widget/conversations/${conversationId}/messages`, {
            headers: { 'x-api-key': API_KEY }
          });
          const data = await res.json();
          setMessages(data);
        } catch (e) { console.error(e); }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [state, conversationId]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const script = document.currentScript || document.querySelector('script[data-key]');
      const slug = script?.getAttribute('data-slug') || window.location.pathname.split('/').pop();
      const res = await fetch(`${API_URL}/api/v1/widget/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          slug,
          key: API_KEY,
          fields: { name, email }
        })
      });
      const data = await res.json();
      setConversationId(data.conversation_id);
      if (data.messages) setMessages(data.messages);
      setState('chat');
    } catch (e) {
      alert('Failed to connect. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !conversationId) return;
    const content = input;
    setInput('');

    // Optimistic add
    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      sender_type: 'customer',
      content,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      await fetch(`${API_URL}/api/v1/widget/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({ content })
      });
      // Refresh messages to get server IDs
      const res = await fetch(`${API_URL}/api/v1/widget/conversations/${conversationId}/messages`, {
        headers: { 'x-api-key': API_KEY }
      });
      const data = await res.json();
      setMessages(data);
    } catch (e) { console.error(e); }
  };

  const getMsgClass = (type: string) => {
    if (type === 'customer') return 'wa-msg wa-msg-customer';
    if (type === 'system') return 'wa-msg wa-msg-system';
    return 'wa-msg wa-msg-agent';
  };

  const accentColor = config?.widget_primary_color || '#2563EB';

  return (
    <div className="wa-widget-container">
      {isOpen && (
        <div className="wa-chat-window">
          {/* Header */}
          <div className="wa-header" style={{ background: accentColor }}>
            <div>
              <div className="wa-header-title">{config?.widget_title || 'Support Chat'}</div>
              <div className="wa-header-subtitle">{config?.widget_subtitle || 'We typically reply in minutes'}</div>
            </div>
            <button className="wa-close-btn" onClick={() => setIsOpen(false)}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="wa-body">
            {state === 'form' ? (
              <div className="wa-form">
                <h4>Hi there! 👋</h4>
                <p>{config?.starter_greeting || 'Tell us who you are so we can help you better.'}</p>
                <form onSubmit={handleStart}>
                  <input
                    className="wa-input"
                    placeholder="Your Name"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                  <input
                    className="wa-input"
                    placeholder="Email Address"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                  <button className="wa-submit-btn" disabled={isLoading} style={{ background: accentColor }}>
                    {isLoading ? 'Connecting...' : 'Start Chat →'}
                  </button>
                </form>
              </div>
            ) : (
              <>
                <div ref={scrollRef} className="wa-messages">
                  {messages.length === 0 && (
                    <div className="wa-typing">
                      <div className="wa-typing-dot" />
                      <div className="wa-typing-dot" />
                      <div className="wa-typing-dot" />
                    </div>
                  )}
                  {messages.map(m => (
                    <div key={m.id} className={getMsgClass(m.sender_type)} style={m.sender_type === 'customer' ? { background: accentColor } : {}}>
                      {m.content}
                    </div>
                  ))}
                </div>
                <form className="wa-reply-bar" onSubmit={handleSend}>
                  <input
                    className="wa-reply-input"
                    placeholder="Type a message..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                  />
                  <button className="wa-send-btn" type="submit" disabled={!input.trim()} style={{ background: accentColor }}>
                    <svg viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="wa-powered">Powered by AfricaCloudSpace</div>
        </div>
      )}

      <button className="wa-launcher" onClick={() => setIsOpen(!isOpen)} style={{ background: accentColor }}>
        {isOpen ? (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>
        )}
      </button>
    </div>
  );
};

// ── App Initialization ───────────────────────────────────────
const scriptTag = document.currentScript || document.querySelector('script[data-key]');
if (scriptTag) {
  API_KEY = scriptTag.getAttribute('data-key') || '';
  API_URL = scriptTag.getAttribute('data-api-url') || API_URL;
}
// Also support legacy global variables
if (!API_KEY && (window as any).WA_WIDGET_API_KEY) {
  API_KEY = (window as any).WA_WIDGET_API_KEY;
}
if ((window as any).WA_WIDGET_API_URL) {
  API_URL = (window as any).WA_WIDGET_API_URL;
}

const container = document.createElement('div');
container.id = 'wa-widget-root';
document.body.appendChild(container);

const styleTag = document.createElement('style');
styleTag.innerHTML = STYLES;
document.head.appendChild(styleTag);

const root = createRoot(container);
root.render(<Widget />);
