'use client';

import { useEffect, useState, useMemo } from 'react';
import { templateApi } from '@/lib/api';
import { useNotifications } from '@/hooks/useNotifications';

type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'all';
type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'all';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TemplateStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory>('all');
  const { notify } = useNotifications();

  // Modal States
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'add' | 'edit'>('add');
  const [currentTemplate, setCurrentTemplate] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await templateApi.list();
      setTemplates(data);
    } catch (err: any) {
      notify('Error', err.message || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await templateApi.sync();
      notify('Success', res.detail);
      loadTemplates();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to sync templates');
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove template "${name}" from local cache?`)) return;
    try {
      await templateApi.deleteLocal(id);
      notify('Success', 'Template removed from local cache');
      loadTemplates();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to remove template');
    }
  };

  const handleSave = async (data: any) => {
    setSaving(true);
    try {
      if (modalType === 'edit' && currentTemplate) {
        await templateApi.update(currentTemplate.id, data);
        notify('Success', 'Template updated');
      } else {
        await templateApi.create(data);
        notify('Success', 'Template created');
      }
      setShowModal(false);
      loadTemplates();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [templates, search, statusFilter, categoryFilter]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      {/* ── Header ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--color-text)' }}>
            Message Templates
          </h1>
          <p className="text-sm mt-1.5 max-w-lg" style={{ color: 'var(--color-text-secondary)' }}>
            Manage and preview your pre-approved WhatsApp templates. Sync directly from your Meta Business account or create/edit locally.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setModalType('add');
              setCurrentTemplate(null);
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-6 py-3 text-sm font-bold border transition-all hover:bg-gray-50 cursor-pointer"
            style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Add Template
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="group relative flex items-center gap-2.5 px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 cursor-pointer overflow-hidden"
            style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-md)' }}
          >
            {syncing && (
              <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
            )}
            {syncing ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5 transition-transform group-hover:rotate-180 duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            <span>{syncing ? 'Syncing...' : 'Sync from Meta'}</span>
          </button>
        </div>
      </div>

      {/* ── Filters Bar ────────────────────────────── */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-4 mb-8 p-4 border" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5" style={{ color: 'var(--color-text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search templates by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500/10"
            style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)' }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 p-1" style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            {(['all', 'APPROVED', 'PENDING', 'REJECTED'] as TemplateStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer`}
                style={{
                  borderRadius: 'var(--radius-sm)',
                  background: statusFilter === status ? 'var(--color-surface)' : 'transparent',
                  color: statusFilter === status ? 'var(--color-text)' : 'var(--color-text-muted)',
                  boxShadow: statusFilter === status ? 'var(--shadow-sm)' : 'none',
                  border: statusFilter === status ? '1px solid var(--color-border)' : '1px solid transparent',
                }}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 p-1" style={{ background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            {(['all', 'MARKETING', 'UTILITY', 'AUTHENTICATION'] as TemplateCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer`}
                style={{
                  borderRadius: 'var(--radius-sm)',
                  background: categoryFilter === cat ? 'var(--color-surface)' : 'transparent',
                  color: categoryFilter === cat ? 'var(--color-text)' : 'var(--color-text-muted)',
                  boxShadow: categoryFilter === cat ? 'var(--shadow-sm)' : 'none',
                  border: categoryFilter === cat ? '1px solid var(--color-border)' : '1px solid transparent',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content Grid ────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-12 h-12 border-4 border-t-transparent animate-spin rounded-full" style={{ borderColor: 'var(--color-primary)' }}></div>
          <p className="text-sm font-medium animate-pulse" style={{ color: 'var(--color-text-muted)' }}>Loading your templates...</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
            {filteredTemplates.map((t) => (
              <TemplateCard 
                key={t.id} 
                template={t} 
                onDelete={() => handleDelete(t.id, t.name)} 
                onEdit={() => {
                  setModalType('edit');
                  setCurrentTemplate(t);
                  setShowModal(true);
                }}
              />
            ))}
          </div>

          {filteredTemplates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed" style={{ borderColor: 'var(--color-border)', borderRadius: 'var(--radius-xl)' }}>
              <div className="w-16 h-16 mb-4 flex items-center justify-center rounded-full" style={{ background: 'var(--color-surface-alt)' }}>
                <svg className="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>No templates found</h3>
              <p className="text-sm max-w-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                {search || statusFilter !== 'all' || categoryFilter !== 'all' 
                  ? "Try adjusting your search or filters to find what you're looking for." 
                  : "Sync from Meta or add a template manually."}
              </p>
              {search && (
                <button 
                  onClick={() => { setSearch(''); setStatusFilter('all'); setCategoryFilter('all'); }}
                  className="mt-6 text-sm font-bold underline cursor-pointer" 
                  style={{ color: 'var(--color-primary)' }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Modals ─────────────────────────────────── */}
      {showModal && (
        <TemplateModal 
          type={modalType}
          template={currentTemplate}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          loading={saving}
        />
      )}
    </div>
  );
}

/* ── Template Modal Component ────────────────────────────── */
function TemplateModal({ type, template, onClose, onSave, loading }: any) {
  // Safe extraction of body text
  const getInitialBody = () => {
    if (!template) return '';
    if (Array.isArray(template.components)) {
      return template.components.find((c: any) => c.type === 'BODY')?.text || '';
    }
    return template.components?.body || '';
  };

  const [formData, setFormData] = useState({
    name: template?.name || '',
    category: template?.category || 'MARKETING',
    language: template?.language || 'en_US',
    body: getInitialBody()
  });

  const fieldStyle = {
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 12px',
    fontSize: '14px',
    color: 'var(--color-text)'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}></div>
      <div 
        className="relative w-full max-w-4xl bg-white shadow-2xl animate-scale-in flex flex-col md:flex-row overflow-hidden" 
        style={{ borderRadius: 'var(--radius-xl)' }}
      >
        {/* Left: Form */}
        <div className="flex-1 p-8 overflow-y-auto max-h-[90vh]">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>
              {type === 'edit' ? 'Edit Template' : 'Create Template'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer text-gray-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest opacity-50">Template Name</label>
              <input 
                type="text" 
                value={formData.name} 
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                placeholder="e.g., welcome_message"
                className="w-full outline-none focus:ring-2 focus:ring-blue-500/10" 
                style={fieldStyle}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest opacity-50">Category</label>
                <select 
                  value={formData.category} 
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full outline-none focus:ring-2 focus:ring-blue-500/10 cursor-pointer" 
                  style={fieldStyle}
                >
                  <option value="MARKETING">MARKETING</option>
                  <option value="UTILITY">UTILITY</option>
                  <option value="AUTHENTICATION">AUTHENTICATION</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-widest opacity-50">Language</label>
                <input 
                  type="text" 
                  value={formData.language} 
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })} 
                  className="w-full outline-none focus:ring-2 focus:ring-blue-500/10" 
                  style={fieldStyle}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest opacity-50">Message Body</label>
              <textarea 
                rows={6}
                value={formData.body} 
                onChange={(e) => setFormData({ ...formData, body: e.target.value })} 
                placeholder="Type your message here. Use {{1}}, {{2}} for variables."
                className="w-full outline-none focus:ring-2 focus:ring-blue-500/10 resize-none font-mono text-[13px]" 
                style={fieldStyle}
              ></textarea>
              <p className="text-[10px] text-gray-400">Variables like {"{{1}}"} will be replaced with dynamic data during broadcast.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-10 pt-6 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors cursor-pointer">
              Cancel
            </button>
            <button 
              onClick={() => onSave({
                name: formData.name,
                category: formData.category,
                language: formData.language,
                components: [{ type: 'BODY', text: formData.body }]
              })}
              disabled={loading || !formData.name || !formData.body}
              className="px-8 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0 cursor-pointer"
              style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-md)' }}
            >
              {loading ? 'Saving...' : type === 'edit' ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="hidden md:flex w-[340px] p-8 flex-col items-center justify-center border-l" style={{ background: 'var(--color-surface-alt)', borderColor: 'var(--color-border)' }}>
          <div className="text-[10px] font-black uppercase tracking-widest mb-6 opacity-30">Live Preview</div>
          
          <div className="w-full bg-[#E5DDD5] p-6 relative overflow-hidden" style={{ borderRadius: '24px', boxShadow: 'inset 0 0 40px rgba(0,0,0,0.05)' }}>
             <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("https://wweb.dev/assets/whatsapp-chat-wallpaper.png")', backgroundSize: '200px' }}></div>
             
             <div className="relative">
                {/* Bubble Tail */}
                <div className="absolute -left-1 top-0 w-3 h-3 rotate-45" style={{ background: '#FFFFFF' }}></div>
                {/* Bubble */}
                <div className="relative bg-white p-3.5 shadow-sm" style={{ borderRadius: '0 12px 12px 12px' }}>
                  <div className="text-[13px] leading-relaxed whitespace-pre-wrap text-[#111B21]">
                    {renderBody(formData.body || 'Your message preview will appear here...')}
                  </div>
                  <div className="mt-1 flex justify-end">
                    <span className="text-[10px] text-[#667781]">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
             </div>
          </div>
          
          <div className="mt-8 text-center px-4">
             <h4 className="text-xs font-bold mb-1" style={{ color: 'var(--color-text)' }}>Looks good?</h4>
             <p className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>This is exactly how your customers will see the message on their phones.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Template Card Component ───────────────────────────── */
function TemplateCard({ template, onDelete, onEdit }: { template: any; onDelete: () => void; onEdit: () => void }) {
  const bodyText = template && Array.isArray(template.components) 
    ? (template.components.find((c: any) => c.type === 'BODY')?.text || '')
    : (template?.components?.body || '');

  const statusColors = {
    APPROVED: { bg: 'var(--status-approved-bg)', text: 'var(--status-approved-text)' },
    PENDING: { bg: 'var(--status-pending-bg)', text: 'var(--status-pending-text)' },
    REJECTED: { bg: 'var(--status-rejected-bg)', text: 'var(--status-rejected-text)' },
  };

  const currentStatus = (template?.status as keyof typeof statusColors) || 'PENDING';
  const colors = statusColors[currentStatus] || statusColors.PENDING;

  return (
    <div 
      className="flex flex-col shadow-sm transition-all hover:shadow-xl hover:-translate-y-1 group border" 
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}
    >
      {/* Card Header */}
      <div className="p-5 border-b flex justify-between items-start gap-4" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' }}>
        <div className="min-w-0">
          <h3 className="font-bold text-sm truncate" style={{ color: 'var(--color-text)' }}>{template?.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] uppercase font-black tracking-widest opacity-40">{template?.category}</span>
            <span className="text-[9px] font-bold opacity-40 px-1 border border-black/10 rounded" style={{ borderColor: 'var(--color-border)' }}>{template?.language}</span>
          </div>
        </div>
        <span 
          className="text-[10px] font-bold px-2 py-1 rounded-full border transition-transform group-hover:scale-105" 
          style={{ background: colors.bg, color: colors.text, borderColor: colors.text + '20' }}
        >
          {template?.status}
        </span>
      </div>

      {/* WhatsApp Preview Area */}
      <div className="p-5 flex-1 flex flex-col justify-center" style={{ background: 'var(--color-wa-bg)' }}>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-3 opacity-30 text-center">Live Preview</div>
        <div className="relative mx-auto w-full max-w-[260px]">
          {/* Bubble Tail */}
          <div className="absolute -left-1 top-0 w-3 h-3 rotate-45" style={{ background: 'var(--color-wa-bubble)' }}></div>
          
          {/* Main Bubble */}
          <div 
            className="relative p-3.5 shadow-sm" 
            style={{ background: 'var(--color-wa-bubble)', borderRadius: '0 12px 12px 12px', border: '1px solid rgba(0,0,0,0.03)' }}
          >
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-wa-text)' }}>
              {renderBody(bodyText)}
            </div>
            <div className="mt-1 flex justify-end">
              <span className="text-[10px]" style={{ color: 'var(--color-wa-meta)' }}>
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Card Footer Actions */}
      <div className="p-4 border-t flex justify-between items-center bg-white" style={{ borderColor: 'var(--color-border)' }}>
        <button 
          onClick={onEdit}
          className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 transition-colors hover:bg-blue-50 cursor-pointer" 
          style={{ color: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          EDIT
        </button>
        <button 
          onClick={onDelete}
          className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 text-red-500 transition-colors hover:bg-red-50 cursor-pointer"
          style={{ borderRadius: 'var(--radius-sm)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          DELETE
        </button>
      </div>
    </div>
  );
}

/* ── Helper: Render Body with Highlights ───────────────── */
function renderBody(text: string) {
  if (!text) return 'No body content';
  
  // Highlight variables like {{1}}, {{2}} etc.
  const parts = text.split(/(\{\{\d+\}\})/g);
  return parts.map((part, i) => {
    if (part.match(/\{\{\d+\}\}/)) {
      return (
        <span key={i} className="px-1 py-0.5 font-mono font-bold text-blue-600 bg-blue-100/50 rounded text-[11px]">
          {part}
        </span>
      );
    }
    return part;
  });
}
