'use client';

import { useState, useEffect } from 'react';
import { superadminApi } from '@/lib/api';
import { toast } from 'react-hot-toast';

export default function MetaOverviewTab() {
  const [data, setData] = useState<{ overview: any; phone_numbers: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverview();
  }, []);

  const fetchOverview = async () => {
    try {
      const res = await superadminApi.getMetaOverview();
      setData(res);
    } catch (error) {
      toast.error('Failed to fetch Meta overview. Check your integration settings.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading Meta data...</div>;

  const overview = data?.overview || {};
  const phoneNumbers = data?.phone_numbers || [];

  return (
    <div className="p-6 space-y-8">
      {/* WABA Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Account Status</div>
          <div className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${overview.health_status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {overview.health_status || 'UNKNOWN'}
          </div>
          <div className="mt-4 text-xs text-slate-500">{overview.name}</div>
        </div>
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">WABA Timezone</div>
          <div className="text-2xl font-black text-slate-800">{overview.timezone || '--'}</div>
          <div className="mt-4 text-xs text-slate-500">Currency: {overview.currency || 'USD'}</div>
        </div>
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Linked Numbers</div>
          <div className="text-2xl font-black text-slate-800">{phoneNumbers.length}</div>
          <button onClick={fetchOverview} className="mt-4 text-xs font-bold text-blue-600 hover:underline">Refresh Data</button>
        </div>
      </div>

      {/* Phone Numbers Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">Meta Registered Phone Numbers</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-3 border-b border-slate-200">Display Name</th>
                <th className="px-6 py-3 border-b border-slate-200">Phone Number</th>
                <th className="px-6 py-3 border-b border-slate-200">Status</th>
                <th className="px-6 py-3 border-b border-slate-200">Quality</th>
                <th className="px-6 py-3 border-b border-slate-200">Limit Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {phoneNumbers.map((pn, i) => (
                <tr key={pn.id || i} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900">{pn.verified_name}</div>
                  </td>
                  <td className="px-6 py-4 font-mono text-sm text-slate-600">
                    {pn.display_phone_number}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      pn.status === 'CONNECTED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {pn.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      pn.quality_rating === 'GREEN' ? 'bg-emerald-100 text-emerald-700' : 
                      pn.quality_rating === 'YELLOW' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {pn.quality_rating}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-slate-700">
                    {pn.messaging_limit_tier}
                  </td>
                </tr>
              ))}
              {phoneNumbers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                    No phone numbers found or Meta API error.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
