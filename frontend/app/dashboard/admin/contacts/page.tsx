'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { contactApi, groupApi } from '@/lib/api';
import { useNotifications } from '@/hooks/useNotifications';

const statsCardStyle = {
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  boxShadow: 'var(--shadow-sm)'
};

const fieldStyle = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)',
  padding: '0.6rem 0.8rem',
  fontSize: '0.875rem'
};

export default function ContactsPage() {
  const [activeTab, setActiveTab] = useState<'contacts' | 'groups'>('contacts');
  const [contacts, setContacts] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Contacts Modals
  const [showModal, setShowModal] = useState(false);
  const [editContact, setEditContact] = useState<any | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', tags: '', group_id: '' });
  
  // Groups Modals
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [manageGroup, setManageGroup] = useState<any | null>(null);
  const [groupFormData, setGroupFormData] = useState({ name: '', description: '' });
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

  const { notify } = useNotifications();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cData, gData] = await Promise.all([
        contactApi.list(),
        groupApi.list()
      ]);
      setContacts(cData.contacts);
      setGroups(gData);
    } catch (err: any) {
      notify('Error', err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const contact = await contactApi.create({
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        tags: formData.tags
      });
      
      if (formData.group_id) {
        await groupApi.addMembers(formData.group_id, [contact.id]);
      }

      notify('Success', 'Contact created');
      setShowModal(false);
      setFormData({ name: '', phone: '', email: '', tags: '', group_id: '' });
      loadData();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to create contact');
    }
  };

  const handleUpdate = async (id: string, data: any) => {
    try {
      await contactApi.update(id, data);
      notify('Success', 'Contact updated');
      setEditContact(null);
      loadData();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to update contact');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete contact "${name}"?`)) return;
    try {
      await contactApi.delete(id);
      notify('Success', 'Contact deleted');
      loadData();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to delete contact');
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await groupApi.create(groupFormData);
      notify('Success', 'Group created');
      setShowGroupModal(false);
      setGroupFormData({ name: '', description: '' });
      loadData();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to create group');
    }
  };

  const handleManageMembers = async () => {
    if (!manageGroup) return;
    try {
      await groupApi.addMembers(manageGroup.id, selectedContactIds);
      notify('Success', 'Group members updated');
      setManageGroup(null);
      loadData();
    } catch (err: any) {
      notify('Error', err.message || 'Failed to update members');
    }
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Delete this group? Members will not be deleted.')) return;
    try {
      await groupApi.delete(id);
      loadData();
    } catch (err: any) {
      notify('Error', 'Failed to delete group');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const headers = lines[0].split(',');
      const data = lines.slice(1).map(line => {
        const values = line.split(',');
        const obj: any = {};
        headers.forEach((header, i) => {
          obj[header.trim().toLowerCase()] = values[i]?.trim();
        });
        return obj;
      }).filter(row => row.name && row.phone);

      try {
        const res = await contactApi.importCsv(data);
        notify('Success', `Imported ${res.imported} contacts`);
        loadData();
      } catch (err: any) {
        notify('Error', err.message || 'Failed to import CSV');
      }
    };
    reader.readAsText(file);
  };

  const filtered = contacts.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.phone.includes(search) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      {/* Tab Switcher */}
      <div className="flex items-center space-x-1 mb-8 p-1 bg-slate-100 w-fit rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
        <button 
          onClick={() => setActiveTab('contacts')}
          className={`px-6 py-2 text-sm font-bold transition-all cursor-pointer ${activeTab === 'contacts' ? 'bg-white shadow-sm' : 'opacity-50 hover:opacity-100'}`}
          style={{ borderRadius: 'var(--radius-lg)', color: activeTab === 'contacts' ? 'var(--color-primary)' : 'var(--color-text)' }}
        >
          Contacts
        </button>
        <button 
          onClick={() => setActiveTab('groups')}
          className={`px-6 py-2 text-sm font-bold transition-all cursor-pointer ${activeTab === 'groups' ? 'bg-white shadow-sm' : 'opacity-50 hover:opacity-100'}`}
          style={{ borderRadius: 'var(--radius-lg)', color: activeTab === 'groups' ? 'var(--color-primary)' : 'var(--color-text)' }}
        >
          Groups
        </button>
      </div>

      {activeTab === 'contacts' ? (
        <>
          {/* Contacts Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>Contact Directory</h1>
              <p className="text-sm opacity-60">Manage your audience and communication lists.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm font-semibold transition-all cursor-pointer hover:bg-slate-50 flex items-center gap-2"
                style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import CSV
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImport} />
              <button
                onClick={() => setShowModal(true)}
                className="px-6 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all cursor-pointer hover:opacity-90 active:scale-95"
                style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}
              >
                Add Contact
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-6 relative">
            <input
              type="text"
              placeholder="Search contacts by name, phone or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              style={{ ...fieldStyle, borderRadius: 'var(--radius-lg)' }}
            />
            <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Table */}
          <div className="overflow-hidden" style={{ ...statsCardStyle, borderRadius: 'var(--radius-xl)' }}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' }}>
                  <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-500">Contact</th>
                  <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-500">Details</th>
                  <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-500">Groups & Tags</th>
                  <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{c.name}</p>
                          <p className="text-xs opacity-50">{c.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{c.email || '—'}</p>
                      <p className="text-[10px] opacity-40 mt-0.5">ID: {c.id.slice(0, 8)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {c.groups?.map((g: any) => (
                          <span key={g.id} className="text-[9px] font-black uppercase px-2 py-0.5 rounded shadow-xs" style={{ background: '#e1f5fe', color: '#0288d1' }}>
                            {g.name}
                          </span>
                        ))}
                        {c.tags?.split(',').filter(Boolean).map((tag: string) => (
                          <span key={tag} className="text-[9px] font-bold uppercase px-2 py-0.5 rounded" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                            {tag.trim()}
                          </span>
                        ))}
                        {(!c.tags && (!c.groups || c.groups.length === 0)) && <span className="text-[10px] opacity-40">—</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setEditContact(c)} className="p-2 hover:bg-white rounded-lg shadow-xs transition-all cursor-pointer text-slate-400 hover:text-primary">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                        <button onClick={() => handleDelete(c.id, c.name)} className="p-2 hover:bg-white rounded-lg shadow-xs transition-all cursor-pointer text-slate-400 hover:text-red-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {/* Groups Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>Contact Groups</h1>
              <p className="text-sm opacity-60">Organize your audience for targeted broadcasting.</p>
            </div>
            <button
              onClick={() => setShowGroupModal(true)}
              className="px-6 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all cursor-pointer hover:opacity-90"
              style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}
            >
              Create New Group
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Virtual "All Contacts" Group */}
            <div className="p-6 transition-all hover:shadow-md cursor-default" style={{ ...statsCardStyle, borderLeft: '4px solid var(--color-primary)' }}>
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-xl">🌎</div>
              </div>
              <h3 className="text-lg font-black mb-1">All Contacts</h3>
              <p className="text-sm opacity-60 mb-6 line-clamp-2">Default group containing everyone in your directory.</p>
              <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-xs font-bold text-primary bg-primary-light px-3 py-1 rounded-full">
                  {contacts.length} Members
                </span>
                <span className="text-[10px] uppercase font-bold opacity-40">System Group</span>
              </div>
            </div>

            {groups.map(group => (
              <div key={group.id} className="p-6 transition-all hover:shadow-md" style={statsCardStyle}>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-xl">🏷️</div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => {
                        setManageGroup(group);
                        setSelectedContactIds(group.members?.map((m: any) => m.id) || []);
                      }}
                      className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-primary transition-all cursor-pointer"
                      title="Manage Members"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    </button>
                    <button onClick={() => deleteGroup(group.id)} className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-red-500 transition-all cursor-pointer" title="Delete Group">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
                <h3 className="text-lg font-black mb-1">{group.name}</h3>
                <p className="text-sm opacity-60 mb-6 line-clamp-2">{group.description || 'No description provided.'}</p>
                <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="text-xs font-bold text-primary bg-primary-light px-3 py-1 rounded-full">
                    {group.member_count || 0} Members
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* --- Modals --- */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md animate-slide-up shadow-2xl overflow-hidden" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-lg font-black">Add New Contact</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <FieldGroup label="Full Name">
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full" style={fieldStyle} placeholder="John Doe" />
              </FieldGroup>
              <FieldGroup label="Phone Number (International format)">
                <input 
                  type="text" 
                  required 
                  value={formData.phone} 
                  onChange={(e) => {
                    let val = e.target.value;
                    // Ensure starts with +
                    if (val && !val.startsWith('+')) val = '+' + val.replace(/\D/g, '');
                    // Only digits after +
                    const clean = val.charAt(0) + val.slice(1).replace(/\D/g, '');
                    if (clean.length <= 16) setFormData({ ...formData, phone: clean });
                  }} 
                  className="w-full font-mono" 
                  style={fieldStyle} 
                  placeholder="+254700000000" 
                />
              </FieldGroup>
              <FieldGroup label="Email Address (Optional)">
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full" style={fieldStyle} placeholder="john@example.com" />
              </FieldGroup>
              <FieldGroup label="Initial Group Assignment">
                <select value={formData.group_id} onChange={(e) => setFormData({ ...formData, group_id: e.target.value })} className="w-full" style={fieldStyle}>
                  <option value="">No Group</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </FieldGroup>
              <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
                <button type="submit" className="px-6 py-2 text-sm font-bold text-white shadow-lg transition-all hover:opacity-90 cursor-pointer" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>Save Contact</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showGroupModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md animate-slide-up shadow-2xl" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-lg font-black">Create Group</h2>
              <button onClick={() => setShowGroupModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <form onSubmit={handleCreateGroup} className="p-6 space-y-4">
              <FieldGroup label="Group Name">
                <input type="text" required value={groupFormData.name} onChange={(e) => setGroupFormData({ ...groupFormData, name: e.target.value })} className="w-full" style={fieldStyle} placeholder="Marketing Leads" />
              </FieldGroup>
              <FieldGroup label="Description">
                <textarea value={groupFormData.description} onChange={(e) => setGroupFormData({ ...groupFormData, description: e.target.value })} className="w-full min-h-[100px]" style={fieldStyle} placeholder="Describe the purpose of this group..." />
              </FieldGroup>
              <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button type="button" onClick={() => setShowGroupModal(false)} className="px-4 py-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
                <button type="submit" className="px-6 py-2 text-sm font-bold text-white shadow-lg transition-all hover:opacity-90 cursor-pointer" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>Create Group</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {manageGroup && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl animate-slide-up shadow-2xl overflow-hidden flex flex-col max-h-[80vh]" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h2 className="text-lg font-black">Manage Members: {manageGroup.name}</h2>
                <p className="text-xs opacity-50">Select contacts to include in this group.</p>
              </div>
              <button onClick={() => setManageGroup(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
               <input type="text" placeholder="Search members to add..." className="w-full px-4 py-2 text-sm" style={fieldStyle} />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {contacts.map(c => (
                <label key={c.id} className="flex items-center p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                  <input 
                    type="checkbox" 
                    checked={selectedContactIds.includes(c.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedContactIds([...selectedContactIds, c.id]);
                      else setSelectedContactIds(selectedContactIds.filter(id => id !== c.id));
                    }}
                    className="w-4 h-4 rounded text-primary focus:ring-primary" 
                  />
                  <div className="ml-4">
                    <p className="text-sm font-bold">{c.name}</p>
                    <p className="text-[10px] opacity-50">{c.phone}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="p-6 bg-slate-50 border-t flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-sm font-bold opacity-60">{selectedContactIds.length} contacts selected</span>
              <div className="flex gap-3">
                <button onClick={() => setManageGroup(null)} className="px-4 py-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
                <button onClick={handleManageMembers} className="px-6 py-2 text-sm font-bold text-white shadow-lg transition-all hover:opacity-90 cursor-pointer" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>Apply Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editContact && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md animate-slide-up shadow-2xl" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-lg font-black">Edit Contact</h2>
              <button onClick={() => setEditContact(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <FieldGroup label="Full Name">
                <input type="text" value={editContact.name} onChange={(e) => setEditContact({ ...editContact, name: e.target.value })} className="w-full" style={fieldStyle} />
              </FieldGroup>
              <FieldGroup label="Phone Number">
                <input 
                  type="text" 
                  value={editContact.phone} 
                  onChange={(e) => {
                    let val = e.target.value;
                    if (val && !val.startsWith('+')) val = '+' + val.replace(/\D/g, '');
                    const clean = val.charAt(0) + val.slice(1).replace(/\D/g, '');
                    if (clean.length <= 16) setEditContact({ ...editContact, phone: clean });
                  }} 
                  className="w-full font-mono" 
                  style={fieldStyle} 
                />
              </FieldGroup>
              <FieldGroup label="Email Address">
                <input type="email" value={editContact.email || ''} onChange={(e) => setEditContact({ ...editContact, email: e.target.value })} className="w-full" style={fieldStyle} />
              </FieldGroup>
              <FieldGroup label="Tags">
                <input type="text" value={editContact.tags || ''} onChange={(e) => setEditContact({ ...editContact, tags: e.target.value })} className="w-full" style={fieldStyle} placeholder="VIP, Lead" />
              </FieldGroup>
              <div className="flex justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <button onClick={() => setEditContact(null)} className="px-4 py-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--color-text-secondary)' }}>Cancel</button>
                <button onClick={() => handleUpdate(editContact.id, editContact)} className="px-6 py-2 text-sm font-bold text-white shadow-lg transition-all hover:opacity-90 cursor-pointer" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-sm)' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-wider opacity-40 px-1">{label}</label>
      {children}
    </div>
  );
}
