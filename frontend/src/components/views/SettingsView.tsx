import React, { useState } from 'react';
import { Settings, ShieldCheck, Key, RefreshCw, CheckCircle2, Bot, Bell, Database } from 'lucide-react';
import { SystemSettings, AuditLog } from '../types';

interface SettingsViewProps {
  settings: SystemSettings;
  auditLogs?: AuditLog[];
  logs?: AuditLog[];
  onSaveSettings?: (newSettings: SystemSettings) => Promise<void>;
  onRefreshSettings?: () => void;
  onReseedData?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  auditLogs,
  logs,
  onSaveSettings,
  onRefreshSettings,
  onReseedData
}) => {
  const activeLogs = auditLogs || logs || [];
  const [formData, setFormData] = useState<SystemSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    try {
      if (onSaveSettings) {
        await onSaveSettings(formData);
      } else {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        if (res.ok && onRefreshSettings) {
          onRefreshSettings();
        }
      }
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate-700" />
          System Settings & Audit Logs
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure Telegram bot credentials, automated scoring rules, and view system activity logs
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Settings Form Bento Card */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center space-x-2">
              <Bot className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-900 text-base">Telegram Engine Configuration</h3>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
              formData.botActive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              {formData.botActive ? 'Active' : 'Offline Engine'}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Telegram Bot API Token</label>
              <input
                type="text"
                value={formData.telegramBotToken}
                onChange={(e) => setFormData({ ...formData, telegramBotToken: e.target.value })}
                placeholder="e.g. 7123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">Obtained from Telegram @BotFather</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Bot Username</label>
                <input
                  type="text"
                  value={formData.botUsername}
                  onChange={(e) => setFormData({ ...formData, botUsername: e.target.value })}
                  placeholder="@MyExamBot"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Simulation Webhook URL</label>
                <input
                  type="text"
                  readOnly
                  value={formData.webhookUrl}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-500 font-mono text-xs"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="pt-2 space-y-3">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.botActive}
                  onChange={(e) => setFormData({ ...formData, botActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="font-semibold text-slate-800">Enable Live Telegram Bot Responses</span>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.autoPublishResults}
                  onChange={(e) => setFormData({ ...formData, autoPublishResults: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="font-semibold text-slate-800">Auto-publish exam score summaries to student upon submission</span>
              </label>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">System Broadcast Notice</label>
              <textarea
                rows={2}
                value={formData.systemNotice}
                onChange={(e) => setFormData({ ...formData, systemNotice: e.target.value })}
                placeholder="Broadcast message sent on /start command..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              {savedSuccess ? (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Settings Saved!
                </span>
              ) : (
                <span className="text-slate-400 text-[11px]">Server authoritative timer is active.</span>
              )}

              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-sm transition-all cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        </div>

        {/* Demo Data & Security Side Bento */}
        <div className="space-y-6">
          <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 text-blue-400">
              <Database className="w-5 h-5" />
              <h3 className="font-bold text-base text-white">Reset Demo Database</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Reseed the database with 150 pre-linked students across Class 10-A Biology and Class 12-B Physics, pre-configured exams, and questions.
            </p>
            <button
              onClick={onReseedData}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs shadow-sm transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reset & Reseed Demo Data</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
            <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Security & Integrity Locks</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              All question answers and scoring formulas are enforced exclusively on the backend server. Students cannot inspect answers or tamper with remaining time.
            </p>
          </div>
        </div>

      </div>

      {/* System Audit Logs Bento Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 text-sm">System Audit & Access Logs</h3>
          <span className="text-xs text-slate-400">Showing recent system events</span>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-2">
          {activeLogs.map((log) => (
            <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-800">{log.action}</div>
                <div className="text-slate-500 text-[11px]">{log.details}</div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] font-mono text-slate-400 block">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className="text-[10px] font-semibold text-blue-600">{log.actor}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
