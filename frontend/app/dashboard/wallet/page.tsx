'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { walletApi, authApi } from '@/lib/api';
import { toast } from 'react-hot-toast';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  method: string;
  status: string;
  reference: string;
  description: string;
  created_at: string;
}

export default function WalletPage() {
  const { state, dispatch } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('10');
  const [submitting, setSubmitting] = useState(false);
  const [activeMethod, setActiveMethod] = useState<'mpesa' | 'paypal' | 'bank'>('mpesa');
  const [phone, setPhone] = useState('');
  const [bankRef, setBankRef] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [txs, currentRates] = await Promise.all([
        walletApi.getTransactions(),
        walletApi.getRates()
      ]);
      setTransactions(txs);
      setRates(currentRates);
      
      // Also refresh 'me' to get latest balance
      const me = await authApi.me();
      dispatch({ type: 'SET_AGENT', agent: me });
    } catch (error) {
      toast.error('Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  };

  const handleTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (isNaN(cents) || cents <= 0) {
      toast.error('Invalid amount');
      return;
    }

    setSubmitting(true);
    try {
      if (activeMethod === 'mpesa') {
        if (!phone) throw new Error('Phone number required for M-Pesa');
        await walletApi.topupMpesa(cents, phone);
        toast.success('M-Pesa STK Push sent. Please check your phone.');
      } else if (activeMethod === 'paypal') {
        await walletApi.topupPaypal(cents);
        toast.success('PayPal order created (Mock integration)');
      } else {
        if (!bankRef) throw new Error('Bank reference required');
        await walletApi.topupBank(cents, bankRef);
        toast.success('Bank transfer logged for approval');
      }
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Payment initiation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const balance = (state.agent?.tenant_wallet_balance || 0) / 100;

  return (
    <div className="flex-1 p-6 md:p-10 overflow-y-auto animate-fade-in bg-slate-50/50">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <header>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Wallet & Billing</h1>
          <p className="text-slate-500 text-sm">Manage your prepaid balance and transaction history.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* ── Balance & Top-up Form ─────────────────── */}
          <div className="lg:col-span-1 space-y-6">
            <div className="p-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl shadow-xl shadow-blue-200 text-white relative overflow-hidden">
              <div className="relative z-10">
                <div className="text-blue-100 text-xs font-bold uppercase tracking-widest mb-1 opacity-80">Available Balance</div>
                <div className="text-4xl font-black mb-6">${balance.toFixed(2)}</div>
                <div className="text-[10px] text-blue-200 uppercase font-black tracking-widest">Prepaid Status: {balance > 0 ? 'ACTIVE' : 'DELETED'}</div>
              </div>
              <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              <div className="absolute -left-4 -top-4 w-24 h-24 bg-blue-400/20 rounded-full blur-xl" />
            </div>

            {/* Estimates */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Estimated Capacity</h3>
              <div className="space-y-4">
                {[
                  { label: 'Normal Chats (Service)', key: 'service', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
                  { label: 'Marketing/Broadcasts', key: 'marketing', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z' },
                  { label: 'Utility Updates', key: 'utility', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' }
                ].map(item => {
                  const rate = rates[item.key] || 0;
                  const capacity = rate > 0 ? Math.floor(balance / rate) : '∞';
                  return (
                    <div key={item.key} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} /></svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{item.label}</div>
                        <div className="text-sm font-black text-slate-700">
                          {capacity.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal ml-1">convos left</span>
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        ${rate.toFixed(4)}/ea
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-[9px] text-slate-400 italic">Estimates are based on current platform rates and 24h conversation windows.</p>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-slate-800 mb-4">Add Funds</h3>
              <form onSubmit={handleTopup} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Amount (USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                    <input 
                      type="number" 
                      value={amount} 
                      onChange={e => setAmount(e.target.value)}
                      className="w-full pl-7 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl">
                  {['mpesa', 'paypal', 'bank'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setActiveMethod(m as any)}
                      className={`py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                        activeMethod === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                {activeMethod === 'mpesa' && (
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">M-Pesa Phone Number</label>
                    <input 
                      type="tel" 
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="254712345678"
                    />
                  </div>
                )}

                {activeMethod === 'bank' && (
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Bank Transfer Reference</label>
                    <input 
                      type="text" 
                      value={bankRef}
                      onChange={e => setBankRef(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                      placeholder="e.g. TRF-992211"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:opacity-50 transition-all uppercase tracking-widest text-xs"
                >
                  {submitting ? 'Processing...' : `Pay $${amount}`}
                </button>
              </form>
            </div>
          </div>

          {/* ── Transaction History ──────────────────── */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800">Transaction History</h3>
                <button onClick={fetchData} className="text-xs font-bold text-blue-600">Refresh</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Description</th>
                      <th className="px-6 py-4">Amount</th>
                      <th className="px-6 py-4">Method</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-bold text-slate-700">{tx.description}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{tx.reference}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-xs font-black ${tx.type === 'topup' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {tx.type === 'topup' ? '+' : '-'}${Math.abs(tx.amount / 100).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{tx.method}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            tx.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 
                            tx.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {transactions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center text-slate-300 text-sm">
                          No transactions found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
