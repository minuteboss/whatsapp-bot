'use client';

import { useEffect, useState, useMemo } from 'react';
import { broadcastApi, templateApi, contactApi, groupApi } from '@/lib/api';
import { useNotifications } from '@/hooks/useNotifications';

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ 
    name: '', 
    template_id: '', 
    group_id: '',
    variables: {} as Record<string, string> 
  });
  const { notify } = useNotifications();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [bData, tData, gData, cData] = await Promise.all([
        broadcastApi.list(),
        templateApi.list(),
        groupApi.list(),
        contactApi.list({ limit: 1 }),
      ]);
      setBroadcasts(bData);
      setTemplates(tData.filter((t: any) => t.status === 'APPROVED'));
      setGroups(gData);
      setTotalContacts(cData.total);
    } catch (err: any) {
      notify('Error', err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === formData.template_id);
  
  // Extract variables from template body
  const templateVariables = useMemo<string[]>(() => {
    if (!selectedTemplate) return [];
    const body = Array.isArray(selectedTemplate.components)
      ? (selectedTemplate.components.find((c: any) => c.type === 'BODY')?.text || '')
      : (selectedTemplate.components?.body || '');
    
    const matches = (body.match(/\{\{\d+\}\}/g) || []) as string[];
    return Array.from(new Set(matches)).sort();
  }, [selectedTemplate]);

  const getSelectedContactsCount = () => {
    if (!formData.group_id) return totalContacts;
    const group = groups.find(g => g.id === formData.group_id);
    return group ? group.member_count : 0;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Convert variables object to components array for Meta API
      const variables = Object.entries(formData.variables).map(([key, value]) => ({
        type: 'text',
        text: value || ''
      }));

      const components = variables.length > 0 ? [
        {
          type: 'body',
          parameters: variables
        }
      ] : [];

      await broadcastApi.create({
        name: formData.name,
        template_id: formData.template_id,
        group_id: formData.group_id || null,
        components
      });

      notify('Success', 'Broadcast started in background');
      setShowModal(false);
      setFormData({ name: '', template_id: '', group_id: '', variables: {} });
      loadData();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to start broadcast');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete broadcast history for "${name}"?`)) return;
    try {
      await broadcastApi.delete(id);
      notify('Success', 'Broadcast record deleted');
      loadData();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to delete broadcast');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--color-text)' }}>Broadcast Campaigns</h1>
          <p className="text-sm mt-1 opacity-60">Send targeted template messages to your audience.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 cursor-pointer active:scale-95"
          style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-md)' }}
        >
          New Broadcast
        </button>
      </div>

      <div className="grid gap-4">
        {broadcasts.map((b) => (
          <div key={b.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm border transition-all hover:shadow-md" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1.5">
                <h3 className="font-bold text-lg truncate" style={{ color: 'var(--color-text)' }}>{b.name}</h3>
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border ${
                  b.status === 'completed' ? 'bg-green-50 text-green-600 border-green-100' : 
                  b.status === 'sending' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-gray-50 text-gray-500 border-gray-100'
                }`}>
                  {b.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs opacity-40 font-medium">
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                  {templates.find(t => t.id === b.template_id)?.name || b.template_id}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  {new Date(b.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-8">
              <StatItem label="Total" value={b.total_contacts} />
              <StatItem label="Sent" value={b.sent_count} color="text-green-600" />
              <StatItem label="Failed" value={b.failed_count || 0} color="text-red-500" />
              <div className="flex items-center gap-2 border-l pl-6" style={{ borderColor: 'var(--color-border)' }}>
                <button 
                  onClick={() => handleDelete(b.id, b.name)}
                  className="p-2 hover:bg-red-50 rounded-lg transition-colors cursor-pointer text-red-400 hover:text-red-600 active:scale-90" 
                  title="Delete Record"
                >
                  <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
        
        {broadcasts.length === 0 && !loading && (
          <div className="text-center py-24 bg-white border-2 border-dashed rounded-2xl" style={{ borderColor: 'var(--color-border)' }}>
             <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl opacity-40">📢</div>
             <h3 className="text-lg font-bold opacity-60">No broadcast history</h3>
             <p className="text-sm opacity-40 max-w-xs mx-auto mt-1">Start your first broadcast campaign to reach your customers at scale.</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowModal(false)}></div>
          <div className="relative w-full max-w-lg bg-white shadow-2xl animate-scale-in overflow-hidden" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="p-8 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-2xl font-black tracking-tight">Launch Campaign</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-50 rounded-full transition-colors cursor-pointer text-slate-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-widest opacity-40 mb-2">Campaign Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramadan Special Offer"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:ring-4 focus:ring-blue-500/5 transition-all outline-none"
                    style={{ borderColor: 'var(--color-border)' }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest opacity-40 mb-2">Target Group</label>
                    <select
                      value={formData.group_id}
                      onChange={(e) => setFormData({ ...formData, group_id: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:ring-4 focus:ring-blue-500/5 transition-all outline-none cursor-pointer"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <option value="">All Contacts ({totalContacts})</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-widest opacity-40 mb-2">Template</label>
                    <select
                      required
                      value={formData.template_id}
                      onChange={(e) => setFormData({ ...formData, template_id: e.target.value, variables: {} })}
                      className="w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:ring-4 focus:ring-blue-500/5 transition-all outline-none cursor-pointer"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <option value="">Choose Template...</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Dynamic Variables Section */}
                {templateVariables.length > 0 && (
                  <div className="p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 animate-fade-in">
                    <label className="block text-[10px] font-black uppercase tracking-widest opacity-40 mb-4 text-center">Map Template Variables</label>
                    <div className="space-y-4">
                      {templateVariables.map((v: string) => (
                        <div key={v} className="flex items-center gap-4">
                          <span className="w-10 h-10 flex items-center justify-center bg-white border font-mono text-xs font-bold rounded-lg shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
                            {v}
                          </span>
                          <input
                            type="text"
                            required
                            placeholder={`Value for ${v}...`}
                            value={formData.variables[v] || ''}
                            onChange={(e) => setFormData({ 
                              ...formData, 
                              variables: { ...formData.variables, [v]: e.target.value } 
                            })}
                            className="flex-1 px-4 py-2.5 bg-white border rounded-lg text-xs focus:ring-2 focus:ring-blue-500/10 outline-none"
                            style={{ borderColor: 'var(--color-border)' }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-4 flex items-center gap-4 bg-blue-50/50 text-blue-800 rounded-2xl border border-blue-100">
                  <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl text-xl shadow-sm border border-blue-100">📢</div>
                  <div>
                    <p className="text-xs font-bold leading-none">Ready to Blast</p>
                    <p className="text-[10px] font-medium opacity-60 mt-1">Targeting <strong>{getSelectedContactsCount()}</strong> people across your selected audience.</p>
                  </div>
                </div>
              </div>
              <div className="p-8 flex space-x-4 bg-slate-50/50">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 text-sm font-bold text-slate-500 hover:text-slate-700 transition-all cursor-pointer">Cancel</button>
                <button 
                  type="submit" 
                  disabled={!formData.template_id || getSelectedContactsCount() === 0}
                  className="flex-[2] py-4 text-sm font-black text-white shadow-xl hover:shadow-2xl transition-all cursor-pointer disabled:opacity-50 disabled:translate-y-0 active:scale-95" 
                  style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-xl)' }}
                >
                  START BROADCAST
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value, color }: any) {
  return (
    <div className="text-center min-w-[50px]">
      <div className={`text-lg font-black ${color || 'text-slate-800'}`}>{value}</div>
      <div className="text-[9px] uppercase font-black tracking-widest opacity-30">{label}</div>
    </div>
  );
}
