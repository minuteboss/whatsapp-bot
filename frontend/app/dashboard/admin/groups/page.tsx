'use client';

import { useState, useEffect } from 'react';
import { groupApi, contactApi } from '@/lib/api';
import { useApp } from '@/context/AppContext';

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const data = await groupApi.list();
      setGroups(data);
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await groupApi.create(newGroup);
      setShowAddModal(false);
      setNewGroup({ name: '', description: '' });
      fetchGroups();
    } catch (err) {
      alert('Failed to create group');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this group?')) return;
    try {
      await groupApi.delete(id);
      fetchGroups();
    } catch (err) {
      alert('Failed to delete group');
    }
  };

  return (
    <div className="flex-1 p-6 lg:p-8 bg-slate-50/30">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ color: 'var(--color-text)' }}>Contact Groups</h1>
          <p className="text-sm opacity-60">Manage segments for targeted broadcasts.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 cursor-pointer"
          style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-md)' }}
        >
          + Create Group
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-3 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white border-2 border-dashed rounded-xl" style={{ borderColor: 'var(--color-border)' }}>
          <div className="text-4xl mb-4">🏷️</div>
          <h2 className="text-lg font-bold mb-1">No groups yet</h2>
          <p className="text-sm opacity-50 max-w-xs mb-6">Create groups to organize your contacts for targeted messaging.</p>
          <button onClick={() => setShowAddModal(true)} className="text-sm font-bold" style={{ color: 'var(--color-primary)' }}>Create your first group</button>
        </div>
      ) : (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <div key={group.id} className="bg-white p-6 border shadow-sm transition-all hover:shadow-md" style={{ borderRadius: 'var(--radius-lg)', borderColor: 'var(--color-border)' }}>
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 flex items-center justify-center rounded-xl text-xl" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                   🏷️
                </div>
                <button onClick={() => handleDelete(group.id)} className="p-2 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
              <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--color-text)' }}>{group.name}</h3>
              <p className="text-sm opacity-60 mb-6 line-clamp-2 min-h-[40px]">{group.description || 'No description provided.'}</p>
              
              <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">Members</span>
                  <span className="text-xl font-black" style={{ color: 'var(--color-primary)' }}>{group.member_count}</span>
                </div>
                <button className="px-4 py-2 text-xs font-bold transition-all hover:bg-slate-50 border rounded-lg cursor-pointer" style={{ color: 'var(--color-text)', borderColor: 'var(--color-border)' }}>
                  View Members
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Modal ────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white shadow-2xl animate-in fade-in zoom-in duration-200" style={{ borderRadius: 'var(--radius-xl)' }}>
            <div className="p-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-xl font-bold">Create New Group</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-40 mb-1.5">Group Name</label>
                <input
                  type="text"
                  placeholder="e.g. VIP Customers"
                  className="w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
                  style={{ borderColor: 'var(--color-border)' }}
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider opacity-40 mb-1.5">Description (Optional)</label>
                <textarea
                  placeholder="Describe the purpose of this group..."
                  className="w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 transition-all outline-none min-h-[100px]"
                  style={{ borderColor: 'var(--color-border)' }}
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                />
              </div>
            </div>
            <div className="p-6 flex space-x-3">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all cursor-pointer">Cancel</button>
              <button onClick={handleCreate} className="flex-1 py-3 text-sm font-bold text-white shadow-lg hover:shadow-xl transition-all cursor-pointer" style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-xl)' }}>Create Group</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
