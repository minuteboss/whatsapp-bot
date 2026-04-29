'use client';

import { useState, useEffect } from 'react';
import { superadminApi } from '@/lib/api';
import { toast } from 'react-hot-toast';

export default function SettingsTab() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await superadminApi.getSettings();
      setSettings(data);
    } catch (error) {
      toast.error('Failed to fetch global settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await superadminApi.updateSettings(settings);
      toast.success('Global settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) return <div className="p-8 text-center">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <form onSubmit={handleSave} className="space-y-8">
        
        {/* Meta Integration */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h3 className="font-bold text-slate-800">Meta WhatsApp Integration</h3>
            <p className="text-xs text-slate-500">Global credentials for the platform's Meta App</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Permanent Access Token</label>
              <input
                type="password"
                value={settings.meta_token || ''}
                onChange={(e) => handleChange('meta_token', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="EAAG..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">WABA ID</label>
              <input
                type="text"
                value={settings.meta_waba_id || ''}
                onChange={(e) => handleChange('meta_waba_id', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">App Secret</label>
              <input
                type="password"
                value={settings.meta_app_secret || ''}
                onChange={(e) => handleChange('meta_app_secret', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Webhook Verify Token</label>
              <input
                type="text"
                value={settings.meta_verify_token || ''}
                onChange={(e) => handleChange('meta_verify_token', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
          </div>
        </section>

        {/* Global Pricing */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h3 className="font-bold text-slate-800">Global Message Pricing (USD)</h3>
            <p className="text-xs text-slate-500">Rate deducted from tenant wallets per conversation category</p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {['marketing', 'utility', 'service', 'auth'].map((cat) => (
              <div key={cat} className="space-y-2">
                <label className="text-sm font-medium text-slate-700 capitalize">{cat}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={settings[`pricing_${cat}`] || '0.00'}
                    onChange={(e) => handleChange(`pricing_${cat}`, e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* M-Pesa Integration */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h3 className="font-bold text-slate-800">M-Pesa Integration (Daraja)</h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Consumer Key</label>
              <input
                type="text"
                value={settings.mpesa_consumer_key || ''}
                onChange={(e) => handleChange('mpesa_consumer_key', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Consumer Secret</label>
              <input
                type="password"
                value={settings.mpesa_consumer_secret || ''}
                onChange={(e) => handleChange('mpesa_consumer_secret', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Shortcode / Paybill</label>
              <input
                type="text"
                value={settings.mpesa_shortcode || ''}
                onChange={(e) => handleChange('mpesa_shortcode', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Passkey</label>
              <input
                type="password"
                value={settings.mpesa_passkey || ''}
                onChange={(e) => handleChange('mpesa_passkey', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
          </div>
        </section>

        {/* PayPal Integration */}
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h3 className="font-bold text-slate-800">PayPal Integration</h3>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Client ID</label>
              <input
                type="text"
                value={settings.paypal_client_id || ''}
                onChange={(e) => handleChange('paypal_client_id', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Client Secret</label>
              <input
                type="password"
                value={settings.paypal_client_secret || ''}
                onChange={(e) => handleChange('paypal_client_secret', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Mode</label>
              <select
                value={settings.paypal_mode || 'sandbox'}
                onChange={(e) => handleChange('paypal_mode', e.target.value)}
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                <option value="sandbox">Sandbox</option>
                <option value="live">Live</option>
              </select>
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-6">
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
