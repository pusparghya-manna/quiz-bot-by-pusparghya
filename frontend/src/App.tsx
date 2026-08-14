import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api, getToken, clearToken } from './api';
import type { Exam, Attempt, SystemSettings, AuditLog, Student } from './types';
import {
  IconHome, IconExam, IconResults, IconSettings, IconBell, IconLogout
} from './icons';
import { Login } from './components/Login';
import { NotifPanel } from './components/NotifPanel';
import { Home } from './pages/Home';
import { Exams } from './pages/Exams';
import { Results } from './pages/Results';
import { Settings } from './pages/Settings';
import { buildNotifications } from './lib/notifications';
import { dedupeStudents } from './lib/students';
import { NotifyHost } from './components/NotifyHost';

type Tab = 'home' | 'exams' | 'results' | 'settings';

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState<Tab>('home');
  const [loading, setLoading] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    telegramBotToken: '', webhookUrl: '', botUsername: '@quizbotbypusparghya_bot',
    botActive: true, autoPublishResults: true, systemNotice: '',
  });
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [notifSeenAt, setNotifSeenAt] = useState(() => {
    try { return localStorage.getItem('quiz_notif_seen') || ''; } catch { return ''; }
  });
  const bellRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    if (!getToken()) return;
    setLoading(true);
    try {
      const res = await api('/api/data');
      if (res.status === 401) { clearToken(); setAuthed(false); return; }
      const d = await res.json();
      setExams(d.exams || []);
      setStudents(d.students || []);
      setAttempts(d.attempts || []);
      if (d.settings) setSettings(d.settings);
      setLogs(d.auditLogs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) load();
  }, [authed, load]);

  const notifications = useMemo(
    () => buildNotifications(dedupeStudents(students), attempts, exams),
    [students, attempts, exams]
  );
  const unread = notifications.filter(
    (n) => !notifSeenAt || new Date(n.at).getTime() > new Date(notifSeenAt).getTime()
  ).length;

  const openNotif = () => {
    setShowNotif((v) => !v);
    const now = new Date().toISOString();
    setNotifSeenAt(now);
    try { localStorage.setItem('quiz_notif_seen', now); } catch {}
  };

  const live = exams.filter((e) => e.status === 'LIVE').length;
  const done = attempts.filter(
    (a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'
  ).length;

  const nav: { id: Tab; label: string; Icon: any }[] = [
    { id: 'home', label: 'Home', Icon: IconHome },
    { id: 'exams', label: 'Exams', Icon: IconExam },
    { id: 'results', label: 'Results', Icon: IconResults },
    { id: 'settings', label: 'Settings', Icon: IconSettings },
  ];

  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  return (
    <div className="min-h-full flex flex-col">
      <NotifyHost />
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200/80">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/favicon.png" alt="Quiz Bot" className="w-8 h-8 rounded-lg object-contain shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-[13px] text-slate-900 leading-tight">Quiz Bot by Pusparghya</div>
              <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${settings.botActive ? 'bg-emerald-500 pulse-ring' : 'bg-slate-300'}`} />
                {settings.botActive ? 'Bot online' : 'Bot offline'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                ref={bellRef}
                type="button"
                onClick={openNotif}
                className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition ${showNotif ? 'text-blue-600 bg-blue-50' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                aria-label="Notifications"
              >
                <IconBell className="w-[18px] h-[18px]" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              {showNotif && (
                <NotifPanel
                  notifications={notifications}
                  onClose={() => setShowNotif(false)}
                  anchorRef={bellRef}
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => { clearToken(); setAuthed(false); }}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
              aria-label="Logout"
            >
              <IconLogout className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 pt-3 safe-pb">
        {loading && exams.length === 0 ? (
          <div className="py-24 text-center">
            <div className="mx-auto w-8 h-8 rounded-xl border-2 border-blue-200 border-t-blue-600 animate-spin" />
            <div className="mt-3 text-sm text-slate-500">Loading dashboard…</div>
          </div>
        ) : (
          <>
            {tab === 'home' && (
              <Home
                exams={exams.length}
                live={live}
                submissions={done}
                students={students}
                attempts={attempts}
                examList={exams}
                onExams={() => setTab('exams')}
              />
            )}
            {tab === 'exams' && (
              <Exams exams={exams} botUsername={settings.botUsername} onRefresh={load} />
            )}
            {tab === 'results' && (
              <Results exams={exams} attempts={attempts} students={students} onRefresh={load} />
            )}
            {tab === 'settings' && (
              <Settings settings={settings} logs={logs} onRefresh={load} />
            )}
          </>
        )}
      </main>

      <nav
        className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'max(var(--safe-bottom), 6px)' }}
      >
        <div className="max-w-3xl mx-auto flex">
          {nav.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition ${
                tab === id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
