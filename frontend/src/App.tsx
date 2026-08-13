import React, { useState, useEffect, useCallback, useMemo, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api, getToken, setToken, clearToken } from './api';
import type { Exam, Question, Attempt, SystemSettings, AuditLog, ExamStatus, Student } from './types';
import {
  IconHome, IconExam, IconResults, IconSettings, IconBell, IconPlus, IconTrash, IconEdit,
  IconLogout, IconCheck, IconUpload, IconEye, IconEyeOff, IconBot, IconRefresh,
  IconClose, IconUsers, IconLive, IconUser, IconMessage, IconHash, IconStar, IconClock,
  IconSearch, IconCalendar, IconBook, IconCopy, IconDownload, IconTag, IconZap, IconShare,
  IconInfo, IconArrowLeft, IconSparkles, IconFileText, IconChart, IconAlert, IconTimer,
  IconSend, IconTrophy, IconChevronDown, IconFilter
} from './icons';

type Tab = 'home' | 'exams' | 'results' | 'settings';

type Notif = { id: string; at: string; title: string; body: string; kind: 'student' | 'official' | 'practice' | 'progress' };

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SCHEDULED: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  LIVE: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  ENDED: 'bg-slate-100 text-slate-500',
  RESULTS_PUBLISHED: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
};

const inp = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-400';
const btn = 'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';
const btnP = btn + ' bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/20 px-3.5 py-2';
const btnS = btn + ' bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 px-3.5 py-2';
const btnD = btn + ' text-red-600 hover:bg-red-50 px-2.5 py-1.5';
const card = 'bg-white rounded-xl border border-slate-200/80 shadow-sm';

/** Exam times are always Asia/Kolkata (IST, UTC+5:30) */
const IST_OFFSET = '+05:30';

function toDatetimeLocalIST(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // format as YYYY-MM-DDTHH:mm in IST
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** datetime-local value (no zone) interpreted as IST → ISO UTC string */
function fromDatetimeLocalIST(local: string): string {
  if (!local) return new Date().toISOString();
  // local is "YYYY-MM-DDTHH:mm" meaning IST
  const withOffset = local.length === 16 ? `${local}:00${IST_OFFSET}` : `${local}${IST_OFFSET}`;
  const d = new Date(withOffset);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function formatIST(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  // e.g. "12 Aug 2026, 9:30 PM"
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  const dayPeriod = (get('dayPeriod') || '').toUpperCase();
  return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} ${dayPeriod}`;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatIST(iso).split(',')[0];
}

function dedupeStudents(students: Student[]): Student[] {
  const map = new Map<string, Student>();
  for (const s of students) {
    const key = s.telegramUserId ? `tg:${s.telegramUserId}` : `id:${s.id}`;
    if (!map.has(key)) map.set(key, s);
  }
  return [...map.values()];
}

function buildNotifications(students: Student[], attempts: Attempt[], exams: Exam[]): Notif[] {
  const items: Notif[] = [];
  for (const s of students) {
    const at = s.linkedAt || '';
    if (at) {
      items.push({
        id: `stu_${s.id}`,
        at,
        title: 'New student',
        body: `${s.name}${s.telegramUsername ? ' (' + s.telegramUsername + ')' : ''} joined`,
        kind: 'student'
      });
    }
  }
  for (const a of attempts) {
    const exam = exams.find(e => e.id === a.examId);
    const examTitle = exam?.title || 'Exam';
    if (a.status === 'IN_PROGRESS' && a.startedAt) {
      items.push({
        id: `prog_${a.id}`,
        at: a.startedAt,
        title: 'Exam in progress',
        body: `${a.studentName} started ${examTitle}`,
        kind: 'progress'
      });
    }
    if ((a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED') && a.submittedAt) {
      const practice = a.isOfficial === false;
      items.push({
        id: `sub_${a.id}`,
        at: a.submittedAt,
        title: practice ? 'Practice submitted' : 'Exam submitted',
        body: `${a.studentName} · ${examTitle} · ${a.score}/${a.maxScore} (${a.percentage}%)`,
        kind: practice ? 'practice' : 'official'
      });
    }
  }
  items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  return items.slice(0, 80);
}

function Badge({ s }: { s: string }) {
  const dot: Record<string, string> = {
    LIVE: 'bg-emerald-500',
    SCHEDULED: 'bg-amber-500',
    RESULTS_PUBLISHED: 'bg-blue-500',
    DRAFT: 'bg-slate-400',
    ENDED: 'bg-slate-300',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_STYLE[s] || STATUS_STYLE.DRAFT}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[s] || 'bg-slate-400'} ${s === 'LIVE' ? 'pulse-ring' : ''}`} />
      {s.replace(/_/g, ' ')}
    </span>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl safe-pb">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 backdrop-blur px-4 py-2.5 rounded-t-3xl sm:rounded-t-2xl">
          <h2 className="text-sm font-bold text-slate-900 truncate">{title}</h2>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 hover:bg-slate-200" aria-label="Close">
            <IconClose className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="p-3.5 pb-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ icon, title, sub }: { icon?: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 pt-0.5">
      {icon && <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-600/20">{icon}</span>}
      <div className="min-w-0">
        <h2 className="font-bold text-[13px] text-slate-900 leading-tight">{title}</h2>
        {sub && <p className="text-[10px] text-slate-500 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

function NotifPanel({ notifications, onClose, anchorRef }: { notifications: Notif[]; onClose: () => void; anchorRef: React.RefObject<HTMLElement | null> }) {
  const kindStyle: Record<string, string> = {
    student: 'bg-blue-50 text-blue-600',
    practice: 'bg-violet-50 text-violet-600',
    progress: 'bg-amber-50 text-amber-600',
    official: 'bg-emerald-50 text-emerald-600',
  };
  const kindIcon = (k: Notif['kind']) => k === 'student' ? IconUser : k === 'practice' ? IconRefresh : k === 'progress' ? IconZap : IconCheck;
  const [pos, setPos] = useState<{ left: number; top: number; caretRight: number } | null>(null);

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const panelW = Math.min(330, vw - 20);
    let left = r.right - panelW;
    left = Math.max(8, Math.min(left, vw - panelW - 8));
    const top = r.bottom + 8;
    const caretRight = Math.max(4, (left + panelW) - (r.right - 16));
    setPos({ left, top, caretRight });
  }, [anchorRef]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      {pos && (
        <div className="fixed z-50 w-[min(330px,calc(100vw_-_20px))] origin-top-right animate-notif-in" style={{ left: pos.left, top: pos.top }}>
          <div className="absolute -top-1.5 w-3 h-3 rotate-45 bg-white border-l border-t border-slate-200 rounded-[2px]" style={{ right: pos.caretRight }} />
          <div className="relative bg-white rounded-xl border border-slate-200 shadow-2xl shadow-slate-900/10 overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-100 bg-slate-50/50">
              <span className="text-xs font-bold text-slate-700">Notifications</span>
              <span className="text-[10px] text-slate-400">{notifications.length} total</span>
            </div>
            <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-50">
              {notifications.length === 0 && (
                <div className="text-sm text-slate-500 text-center py-8">No activity yet</div>
              )}
              {notifications.map((n) => {
                const KindIcon = kindIcon(n.kind);
                return (
                  <div key={n.id} className="flex gap-2.5 px-3 py-2 hover:bg-slate-50/80">
                    <span className={`w-7 h-7 rounded-lg ${kindStyle[n.kind]} flex items-center justify-center shrink-0 mt-0.5`}>
                      <KindIcon className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] font-bold text-slate-500">{n.title}</div>
                        <div className="text-[10px] text-slate-400 shrink-0">{relativeTime(n.at)}</div>
                      </div>
                      <div className="text-xs font-medium text-slate-800 mt-0.5 leading-snug">{n.body}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}

/* ─── Login ─── */
function Login({ onOk }: { onOk: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { username: u.trim(), password: p }
        : { username: u.trim(), password: p, name: name.trim() || u.trim() };
      const res = await api(path, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || (mode === 'login' ? 'Invalid credentials' : 'Registration failed'));
      setToken(data.token);
      onOk();
    } catch (e: any) {
      setErr(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-5 relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="absolute -bottom-28 -left-24 w-80 h-80 rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-5">
          <div className="mx-auto w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 ring-1 ring-white/40 ring-offset-2 ring-offset-slate-100 mb-3">
            <IconBot className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Quiz Bot by Pusparghya</h1>
          <p className="text-xs text-slate-500 mt-0.5">Teacher Dashboard</p>
        </div>

        <div className="flex gap-1 bg-slate-200/60 p-1 rounded-lg mb-3 ring-1 ring-slate-200">
          <button type="button" onClick={() => { setMode('login'); setErr(''); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${mode === 'login' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
            Sign in
          </button>
          <button type="button" onClick={() => { setMode('register'); setErr(''); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${mode === 'register' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
            Register
          </button>
        </div>

        <form onSubmit={go} className={card + ' p-4 space-y-3 ring-1 ring-slate-200/70 shadow-xl shadow-slate-200/50'}>
          {mode === 'register' && (
            <Field label="Full name">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconUser className="w-3.5 h-3.5" /></span>
                <input className={inp + ' pl-9'} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" />
              </div>
            </Field>
          )}
          <Field label="Username">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconHash className="w-3.5 h-3.5" /></span>
              <input className={inp + ' pl-9'} value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoCapitalize="off" required placeholder="Choose a username" />
            </div>
          </Field>
          <Field label="Password">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconEyeOff className="w-3.5 h-3.5" /></span>
              <input className={inp + ' pr-10 pl-9'} type={show ? 'text' : 'password'} value={p} onChange={(e) => setP(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required placeholder={mode === 'register' ? 'Min 6 characters' : 'Password'} />
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setShow((v) => !v)} className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600">
                {show ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </Field>
          {err && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <IconAlert className="w-3.5 h-3.5 shrink-0" />{err}
            </div>
          )}
          <button type="submit" disabled={busy} className={btnP + ' w-full'}>
            {busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>
        <p className="text-center text-xs text-slate-400 mt-5">Quiz Bot by Pusparghya</p>
      </div>
    </div>
  );
}

/* ─── empty question ─── */
const emptyQ = (): Question => ({
  id: `Q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  question: '',
  options: ['', '', '', ''],
  answer: 0,
  marks: 1,
  negativeMarks: 0,
  subject: '',
  explanation: '',
});

/* ─── Main ─── */
export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [tab, setTab] = useState<Tab>('home');
  const [loading, setLoading] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    telegramBotToken: '', webhookUrl: '', botUsername: '@quizbotbypusparghya_bot',
    botActive: true, autoPublishResults: true, systemNotice: '',
  });
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const bellRef = useRef<HTMLButtonElement | null>(null);
  const [notifSeenAt, setNotifSeenAt] = useState(() => {
    try { return localStorage.getItem('quiz_notif_seen') || ''; } catch { return ''; }
  });

  const load = useCallback(async () => {
    if (!getToken()) return;
    setLoading(true);
    try {
      const res = await api('/api/data');
      if (res.status === 401) { clearToken(); setAuthed(false); return; }
      if (!res.ok) return;
      const d = await res.json();
      setExams(d.exams || []);
      setAttempts(d.attempts || []);
      setStudents(d.students || []);
      if (d.settings) setSettings(d.settings);
      setLogs(d.auditLogs || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const uniqueStudents = useMemo(() => dedupeStudents(students), [students]);
  const notifications = useMemo(() => buildNotifications(uniqueStudents, attempts, exams), [uniqueStudents, attempts, exams]);
  const unread = notifications.filter(n => !notifSeenAt || new Date(n.at).getTime() > new Date(notifSeenAt).getTime()).length;

  const openNotif = () => {
    if (!showNotif) {
      const now = new Date().toISOString();
      setNotifSeenAt(now);
      try { localStorage.setItem('quiz_notif_seen', now); } catch {}
    }
    setShowNotif(!showNotif);
  };

  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  const live = exams.filter((e) => e.status === 'LIVE' || e.status === 'SCHEDULED').length;
  const done = attempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED').length;

  const nav: { id: Tab; label: string; Icon: any }[] = [
    { id: 'home', label: 'Home', Icon: IconHome },
    { id: 'exams', label: 'Exams', Icon: IconExam },
    { id: 'results', label: 'Results', Icon: IconResults },
    { id: 'settings', label: 'Settings', Icon: IconSettings },
  ];

  return (
    <div className="min-h-full flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200/80">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-blue-600/20 ring-1 ring-white/40 ring-offset-1 ring-offset-slate-100">
              <IconBot className="w-[18px] h-[18px]" />
            </div>
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
              <button ref={bellRef} type="button" onClick={openNotif} className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition ${showNotif ? 'text-blue-600 bg-blue-50' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`} aria-label="Notifications">
                <IconBell className="w-[18px] h-[18px]" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              {showNotif && <NotifPanel notifications={notifications} onClose={() => setShowNotif(false)} anchorRef={bellRef} />}
            </div>
            <button type="button" onClick={() => { clearToken(); setAuthed(false); }} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition" aria-label="Logout">
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
            {tab === 'home' && <Home exams={exams.length} live={live} submissions={done} students={students} attempts={attempts} examList={exams} onExams={() => setTab('exams')} />}
            {tab === 'exams' && <Exams exams={exams} botUsername={settings.botUsername} onRefresh={load} />}
            {tab === 'results' && <Results exams={exams} attempts={attempts} students={students} onRefresh={load} />}
            {tab === 'settings' && <Settings settings={settings} logs={logs} onRefresh={load} />}
          </>
        )}
      </main>

      {/* Bottom nav — always visible on mobile */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]" style={{ paddingBottom: 'max(var(--safe-bottom), 6px)' }}>
        <div className="max-w-3xl mx-auto grid grid-cols-4 h-[52px]">
          {nav.map(({ id, label, Icon }) => {
            const on = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`relative flex flex-col items-center justify-center text-[10px] font-semibold transition ${on ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {on && <span className="absolute top-0.5 left-1/2 -translate-x-1/2 w-11 h-[26px] rounded-full bg-blue-50/90" />}
                <span className="relative flex flex-col items-center gap-0">
                  <Icon className={`w-[20px] h-[20px] ${on ? 'stroke-[2.5]' : ''}`} />
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function Home({ exams, live, submissions, students, attempts, examList, onExams }: {
  exams: number; live: number; submissions: number; students: Student[]; attempts: Attempt[]; examList: Exam[]; onExams: () => void;
}) {
  const [profile, setProfile] = useState<Student | null>(null);

  const uniqueStudents = useMemo(() => dedupeStudents(students), [students]);

  const performance = (s: Student) => {
    const mine = attempts.filter(a =>
      (a.telegramUserId && s.telegramUserId && a.telegramUserId === s.telegramUserId) || a.studentId === s.studentId
    ).filter(a => a.isOfficial !== false && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'));
    if (!mine.length) return -1;
    return Math.max(...mine.map(a => a.percentage || 0));
  };
  const ranked = uniqueStudents.slice().sort((a, b) => performance(b) - performance(a));
  const studentAttempts = (s: Student) =>
    attempts.filter(a =>
      (a.telegramUserId && s.telegramUserId && a.telegramUserId === s.telegramUserId) || a.studentId === s.studentId
    ).slice().sort((a, b) => new Date(b.submittedAt || b.startedAt).getTime() - new Date(a.submittedAt || a.startedAt).getTime());
  const tgLink = (s: Student) => {
    if (s.telegramUsername) return `https://t.me/${s.telegramUsername.replace(/^@/, '')}`;
    if (s.telegramUserId) return `tg://user?id=${s.telegramUserId}`;
    return null;
  };

  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';

  const rankColor = (i: number) =>
    i === 0 ? 'bg-amber-400 text-amber-950'
      : i === 1 ? 'bg-slate-300 text-slate-700'
        : i === 2 ? 'bg-orange-300 text-orange-950'
          : 'bg-slate-100 text-slate-600';

  const avatarColor = (s: Student) => {
    const colors = ['bg-blue-100 text-blue-700', 'bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700'];
    let h = 0;
    for (const c of s.name) h = (h * 31 + c.charCodeAt(0)) % 997;
    return colors[h % colors.length];
  };

  if (profile) {
    const list = studentAttempts(profile);
    const msg = tgLink(profile);
    return (
      <div className="space-y-3">
        <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700" onClick={() => setProfile(null)}>
          <IconArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className={card + ' p-3 ring-1 ring-slate-200/70 overflow-hidden relative'}>
          <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-blue-50" />
          <div className="relative flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${avatarColor(profile)} flex items-center justify-center font-bold text-sm shrink-0 ring-1 ring-white shadow-sm`}>{initials(profile.name)}</div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-slate-900 truncate">{profile.name}</div>
              <div className="text-[11px] text-slate-500 mt-0.5 space-y-0.5">
                <div className="flex items-center gap-1"><IconMessage className="w-3 h-3" />{profile.telegramUsername || '—'}</div>
                <div className="flex items-center gap-1"><IconHash className="w-3 h-3" />{profile.studentId}</div>
              </div>
            </div>
          </div>
          {msg && (
            <a href={msg} target="_blank" rel="noreferrer" className={btnP + ' w-full mt-2.5 text-xs no-underline relative'}>
              <IconMessage className="w-3.5 h-3.5" /> Message on Telegram
            </a>
          )}
        </div>
        <SectionTitle icon={<IconResults className="w-3.5 h-3.5" />} title="Exams & results" />
        {list.length === 0 && <div className={card + ' p-5 text-center text-sm text-slate-500'}>No attempts yet</div>}
        <div className="space-y-2">
          {list.map((a) => {
            const exam = examList.find((e) => e.id === a.examId);
            const practice = a.isOfficial === false;
            return (
              <div key={a.id} className={card + ' p-3'}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-[13px] text-slate-900 truncate">{exam?.title || a.examId}</div>
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${practice ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'}`}>
                    {practice ? <IconRefresh className="w-2.5 h-2.5" /> : <IconTag className="w-2.5 h-2.5" />} {practice ? 'Practice' : 'Official'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{a.status.replace(/_/g, ' ')}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1"><IconStar className="w-3 h-3 text-amber-500" />{a.score}/{a.maxScore} ({a.percentage}%)</span>
                  <span className="inline-flex items-center gap-1"><IconClock className="w-3 h-3" />{Math.floor(a.timeTakenSeconds / 60)}m {a.timeTakenSeconds % 60}s</span>
                  {a.rank ? <span className="inline-flex items-center gap-1"><IconTrophy className="w-3 h-3 text-blue-600" />#{a.rank}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: 'Exams', value: exams, Icon: IconExam, tint: 'from-blue-500 to-indigo-500', chip: 'bg-blue-50 text-blue-600' },
    { label: 'Live', value: live, Icon: IconLive, tint: 'from-emerald-500 to-teal-500', chip: 'bg-emerald-50 text-emerald-600' },
    { label: 'Subs', value: submissions, Icon: IconResults, tint: 'from-amber-500 to-orange-500', chip: 'bg-amber-50 text-amber-600' },
    { label: 'Students', value: ranked.length, Icon: IconUsers, tint: 'from-violet-500 to-purple-500', chip: 'bg-violet-50 text-violet-600' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Home</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">Quiz Bot by Pusparghya</p>
        </div>
        <button type="button" onClick={onExams} className={btnP + ' !py-1.5 !px-2.5 text-[11px]'}><IconPlus className="w-3.5 h-3.5" /> Exam</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {statCards.map((c) => (
          <div key={c.label} className={card + ' p-2.5 relative overflow-hidden'}>
            <div className={`absolute -right-5 -top-5 w-12 h-12 rounded-full bg-gradient-to-br ${c.tint} opacity-[0.08]`} />
            <div className={`w-7 h-7 rounded-lg ${c.chip} flex items-center justify-center mb-1.5`}>
              <c.Icon className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-bold text-slate-900 leading-none">{c.value}</div>
            <div className="text-[9px] font-semibold text-slate-500 mt-0.5 uppercase tracking-wide">{c.label}</div>
          </div>
        ))}
      </div>

      <SectionTitle icon={<IconTrophy className="w-3.5 h-3.5" />} title="Students · by performance" sub="Tap a student to see exams & results" />
      {ranked.length === 0 ? (
        <div className={card + ' p-6 text-center text-sm text-slate-500'}>
          No students yet
        </div>
      ) : (
        <div className="space-y-1.5">
          {ranked.map((s, i) => {
            const perf = performance(s);
            return (
              <button key={s.id} type="button" onClick={() => setProfile(s)} className={card + ' p-2 w-full text-left flex items-center gap-2 hover:border-blue-300 hover:shadow-md hover:shadow-blue-500/5 transition'}>
                <div className={`w-7 h-7 rounded-full ${rankColor(i)} flex items-center justify-center text-[11px] font-bold shrink-0 ring-1 ring-white shadow-sm`}>{i + 1}</div>
                <div className={`w-8 h-8 rounded-full ${avatarColor(s)} flex items-center justify-center text-[11px] font-bold shrink-0 ring-1 ring-white shadow-sm`}>{initials(s.name)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[13px] text-slate-900 truncate">{s.name}</div>
                  <div className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                    <IconMessage className="w-2.5 h-2.5 shrink-0" />{s.telegramUsername || '—'} · <IconHash className="w-2.5 h-2.5 shrink-0" />{s.studentId}
                  </div>
                </div>
                <div className={`text-[11px] font-bold shrink-0 px-1.5 py-0.5 rounded-md ${perf < 0 ? 'text-slate-400' : 'text-blue-600 bg-blue-50'}`}>{perf < 0 ? '—' : `${perf}%`}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── EXAMS (questions inside exam) ─── */
function Exams({ exams, botUsername, onRefresh }: { exams: Exam[]; botUsername: string; onRefresh: () => void }) {
  const [shareLink, setShareLink] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [step, setStep] = useState<'info' | 'questions' | 'review'>('info');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', subject: '', className: '', testNumber: '', startDate: '',
    durationMinutes: 60, negativeMarking: 0, status: 'DRAFT' as ExamStatus,
    randomizeQuestions: false, randomizeOptions: false,
  });
  const [qs, setQs] = useState<Question[]>([]);
  const [qMode, setQMode] = useState<'list' | 'manual' | 'json' | 'ocr'>('list');
  const [editQ, setEditQ] = useState<Question | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [toast, setToast] = useState('');
  const examLink = (id: string) => {
    const u = (botUsername || '').replace(/^@/, '').trim() || 'YourBot';
    return `https://t.me/${u}?start=exam_${id}`;
  };
  const copyLink = async (id: string) => {
    const link = examLink(id);
    setShareLink(link);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Exam link', text: 'Join this exam:', url: link });
        return;
      }
    } catch { /* user cancelled share */ }
    try {
      await navigator.clipboard.writeText(link);
      alert('Exam link copied!\n\n' + link);
    } catch {
      prompt('Copy this exam link for students:', link);
    }
  };


  const filtered = exams.filter((e) => {
    const s = search.toLowerCase();
    return !s || e.title.toLowerCase().includes(s) || e.subject?.toLowerCase().includes(s);
  });

  const reset = () => {
    setForm({
      title: '', subject: '', className: '', testNumber: '',
      startDate: toDatetimeLocalIST(new Date().toISOString()),
      durationMinutes: 60, negativeMarking: 0, status: 'DRAFT',
      randomizeQuestions: false, randomizeOptions: false,
    });
    setQs([]);
    setStep('info');
    setQMode('list');
    setEditId(null);
    setEditQ(null);
  };

  const startCreate = () => { reset(); setOpen(true); };
  const startEdit = (exam: Exam) => {
    setEditId(exam.id);
    setForm({
      title: exam.title, subject: exam.subject || '', className: exam.className || '',
      testNumber: exam.testNumber || '', startDate: toDatetimeLocalIST(exam.startDate) || '',
      durationMinutes: exam.durationMinutes || 60, negativeMarking: exam.negativeMarking || 0,
      status: exam.status, randomizeQuestions: !!exam.randomizeQuestions, randomizeOptions: !!exam.randomizeOptions,
    });
    setQs((exam.questions || []).map((q) => ({ ...q, options: [...(q.options || ['', '', '', ''])].slice(0, 4) })));
    setStep('info');
    setQMode('list');
    setOpen(true);
  };

  const saveExam = async () => {
    if (!form.title.trim()) return alert('Title required');
    if (qs.length === 0) return alert('Add at least one question');
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        subject: form.subject,
        className: form.className,
        testNumber: form.testNumber,
        startDate: form.startDate ? fromDatetimeLocalIST(form.startDate) : new Date().toISOString(),
        durationMinutes: Number(form.durationMinutes),
        negativeMarking: Number(form.negativeMarking),
        status: form.status,
        randomizeQuestions: form.randomizeQuestions,
        randomizeOptions: form.randomizeOptions,
        resultVisibility: 'PUBLISHED',
        leaderboardVisibility: 'PUBLISHED',
        questions: qs,
        totalQuestions: qs.length,
        totalMarks: qs.reduce((s, q) => s + (Number(q.marks) || 1), 0),
      };
      const res = editId
        ? await api(`/api/exams/${editId}`, { method: 'PUT', body: JSON.stringify(body) })
        : await api('/api/exams', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Save failed');
      }
      const saved = await res.json().catch(() => ({}));
      const newId = saved.id || editId;
      setOpen(false);
      onRefresh();
      if (newId) {
        setTimeout(() => copyLink(String(newId)), 300);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const delExam = async (id: string) => {
    if (!confirm('Delete this exam?')) return;
    await api(`/api/exams/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const addManual = () => {
    const q = emptyQ();
    setEditQ(q);
    setQMode('manual');
  };

  const saveManualQ = () => {
    if (!editQ || !editQ.question.trim()) return alert('Question text required');
    setQs((prev) => {
      const i = prev.findIndex((x) => x.id === editQ.id);
      if (i >= 0) { const n = [...prev]; n[i] = editQ; return n; }
      return [...prev, editQ];
    });
    setEditQ(null);
    setQMode('list');
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const list: any[] = Array.isArray(parsed) ? parsed : parsed.questions || [];
      const mapped: Question[] = list.map((item, i) => ({
        id: item.id || `Q_${Date.now()}_${i}`,
        question: item.question || item.text || '',
        options: (item.options || ['', '', '', '']).slice(0, 4),
        answer: typeof item.answer === 'number' ? item.answer : 0,
        marks: item.marks ?? 1,
        negativeMarks: item.negativeMarks ?? 0,
        subject: item.subject || form.subject,
        explanation: item.explanation || '',
      }));
      setQs((prev) => [...prev, ...mapped.filter((q) => q.question)]);
      setJsonText('');
      setQMode('list');
      setToast(`Added ${mapped.length} questions`);
      setTimeout(() => setToast(''), 2000);
    } catch {
      alert('Invalid JSON');
    }
  };

  const onOcr = async (file: File) => {
    setOcrBusy(true);
    setToast('');
    try {
      const b64: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await api('/api/ocr/parse', {
        method: 'POST',
        body: JSON.stringify({ fileBase64: b64, mimeType: file.type || 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'OCR failed');
      const list: any[] = Array.isArray(data) ? data : data.questions || data.parsed || [];
      const mapped: Question[] = list.map((item, i) => ({
        id: `Q_OCR_${Date.now()}_${i}`,
        question: item.question || item.text || '',
        options: (item.options || ['', '', '', '']).slice(0, 4),
        answer: typeof item.answer === 'number' ? item.answer : 0,
        marks: item.marks ?? 1,
        negativeMarks: item.negativeMarks ?? 0,
        subject: item.subject || form.subject,
        explanation: item.explanation || '',
      }));
      setQs((prev) => [...prev, ...mapped.filter((q) => q.question)]);
      setQMode('list');
      setToast(`OCR added ${mapped.length} questions — please review`);
      setTimeout(() => setToast(''), 3000);
    } catch (e: any) {
      alert(e.message || 'OCR failed');
    } finally {
      setOcrBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Exams</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">{exams.length} total</p>
        </div>
        <button type="button" className={btnP + ' !py-1.5 !px-2.5 text-[11px]'} onClick={startCreate}>
          <IconPlus className="w-3.5 h-3.5" /> New
        </button>
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconSearch className="w-3.5 h-3.5" /></span>
        <input className={inp + ' pl-9'} placeholder="Search exams…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100" aria-label="Clear search">
            <IconClose className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {shareLink && (
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-blue-800 mb-1">
            <IconShare className="w-3.5 h-3.5" /> Student exam link
          </div>
          <a href={shareLink} className="text-blue-600 underline break-all" target="_blank" rel="noreferrer">{shareLink}</a>
          <p className="text-[10px] text-blue-700/80 mt-1 flex items-center gap-1"><IconInfo className="w-3 h-3 shrink-0" />Share this with students. Only this link starts the exam.</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className={card + ' p-6 text-center text-sm text-slate-500'}>
            <div className="mx-auto w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-1.5"><IconExam className="w-5 h-5" /></div>
            No exams {search ? 'match your search' : 'yet'}. Tap <strong>New</strong> to create one.
          </div>
        )}
        {filtered.map((exam) => (
          <div key={exam.id} className={card + ' p-3 hover:shadow-md hover:shadow-slate-200/60 transition'}>
            <div className="flex items-start gap-2.5">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[13px] text-slate-900 leading-snug">{exam.title}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 mt-1">
                  {exam.subject ? <span className="inline-flex items-center gap-1"><IconBook className="w-3 h-3" />{exam.subject}</span> : null}
                  {exam.className ? <span className="inline-flex items-center gap-1"><IconUsers className="w-3 h-3" />{exam.className}</span> : null}
                  <span className="inline-flex items-center gap-1"><IconFileText className="w-3 h-3" />{exam.totalQuestions || exam.questions?.length || 0} Qs</span>
                  <span className="inline-flex items-center gap-1"><IconClock className="w-3 h-3" />{exam.durationMinutes}m</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1"><IconCalendar className="w-3 h-3" />Starts: {formatIST(exam.startDate)}</div>
                <div className="mt-1.5"><Badge s={exam.status} /></div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button type="button" className="inline-flex items-center gap-1 px-2 h-8 rounded-lg border border-blue-100 text-blue-600 hover:bg-blue-50 text-[9px] font-bold" onClick={() => copyLink(exam.id)} aria-label="Share">
                  <IconShare className="w-3 h-3" /> Share
                </button>
                <button type="button" className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 hover:border-slate-300" onClick={() => startEdit(exam)} aria-label="Edit">
                  <IconEdit className="w-3.5 h-3.5" />
                </button>
                <button type="button" className="w-8 h-8 rounded-lg border border-red-100 flex items-center justify-center text-red-500 hover:bg-red-50" onClick={() => delExam(exam.id)} aria-label="Delete">
                  <IconTrash className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <Sheet title={editId ? 'Edit exam' : 'New exam'} onClose={() => setOpen(false)}>
          {/* Steps */}
          <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-lg">
            {([
              { id: 'info', label: '1. Info' },
              { id: 'questions', label: '2. Questions' },
              { id: 'review', label: '3. Review' },
            ] as const).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${step === s.id ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {step === 'info' && (
            <div className="space-y-2.5">
              <Field label="Exam title"><input className={inp} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Biology Unit Test 3" /></Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Field label="Subject"><input className={inp} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
                <Field label="Class / group"><input className={inp} value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} /></Field>
                <Field label="Test code"><input className={inp} value={form.testNumber} onChange={(e) => setForm({ ...form, testNumber: e.target.value })} /></Field>
                <Field label="Start time"><input type="datetime-local" className={inp} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
                <Field label="Duration (minutes)"><input type="number" className={inp} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: +e.target.value })} /></Field>
                <Field label="Negative marking"><input type="number" step="0.25" className={inp} value={form.negativeMarking} onChange={(e) => setForm({ ...form, negativeMarking: +e.target.value })} /></Field>
              </div>
              <Field label="Status">
                <div className="relative">
                  <select className={inp + ' appearance-none pr-9'} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ExamStatus })}>
                    {['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'RESULTS_PUBLISHED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><IconChevronDown className="w-3.5 h-3.5" /></span>
                </div>
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px] pt-0.5">
                <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2.5 transition ${form.randomizeQuestions ? 'border-blue-300 bg-blue-50/50 text-blue-700' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="checkbox" checked={form.randomizeQuestions} onChange={(e) => setForm({ ...form, randomizeQuestions: e.target.checked })} className="accent-blue-600" />
                  Shuffle questions
                </label>
                <label className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2.5 transition ${form.randomizeOptions ? 'border-blue-300 bg-blue-50/50 text-blue-700' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="checkbox" checked={form.randomizeOptions} onChange={(e) => setForm({ ...form, randomizeOptions: e.target.checked })} className="accent-blue-600" />
                  Shuffle options
                </label>
              </div>
              <button type="button" className={btnP + ' w-full mt-1'} onClick={() => setStep('questions')}>Next: Questions →</button>
            </div>
          )}

          {step === 'questions' && (
            <div className="space-y-3">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                {([
                  { id: 'list', label: 'List' },
                  { id: 'ocr', label: 'Photo' },
                  { id: 'manual', label: 'Manual' },
                  { id: 'json', label: 'JSON' },
                ] as const).map((m) => (
                  <button key={m.id} type="button" onClick={() => { setQMode(m.id); if (m.id === 'manual') addManual(); }}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition ${qMode === m.id ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
                    {m.label}
                  </button>
                ))}
              </div>

              {toast && <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2"><IconCheck className="w-3.5 h-3.5 shrink-0" />{toast}</div>}

              {qMode === 'list' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-slate-700 inline-flex items-center gap-1.5"><IconFileText className="w-3.5 h-3.5 text-blue-500" />{qs.length} questions</span>
                    <button type="button" className={btnS + ' !py-1 text-[12px]'} onClick={addManual}><IconPlus className="w-3.5 h-3.5" /> Add</button>
                  </div>
                  {qs.length === 0 && <p className="text-sm text-slate-500 text-center py-5">No questions yet. Use Photo, Manual, or JSON.</p>}
                  <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-0.5">
                    {qs.map((q, i) => (
                      <div key={q.id} className="border border-slate-200 rounded-lg p-2.5 hover:border-slate-300 transition">
                        <div className="text-[10px] text-slate-400 font-semibold mb-0.5">Q{i + 1} · Ans {String.fromCharCode(65 + (q.answer ?? 0))} · {q.marks} mark</div>
                        <div className="text-[13px] font-medium text-slate-800 line-clamp-2">{q.question}</div>
                        <div className="flex gap-1.5 mt-1.5">
                          <button type="button" className={btnS + ' !py-1 text-[11px]'} onClick={() => { setEditQ({ ...q, options: [...q.options] }); setQMode('manual'); }}><IconEdit className="w-3 h-3" /> Edit</button>
                          <button type="button" className={btnD + ' text-[11px]'} onClick={() => setQs((p) => p.filter((x) => x.id !== q.id))}><IconTrash className="w-3 h-3" /> Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button type="button" className={btnS + ' flex-1'} onClick={() => setStep('info')}>← Back</button>
                    <button type="button" className={btnP + ' flex-1'} onClick={() => setStep('review')}>Review →</button>
                  </div>
                </>
              )}

              {qMode === 'manual' && editQ && (
                <div className="space-y-2.5">
                  <Field label="Question"><textarea className={inp + ' min-h-[80px]'} value={editQ.question} onChange={(e) => setEditQ({ ...editQ, question: e.target.value })} /></Field>
                  {['A', 'B', 'C', 'D'].map((L, i) => (
                    <Field key={L} label={`Option ${L}`}>
                      <div className="relative">
                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold rounded-md flex items-center justify-center ${editQ.answer === i ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`} style={{ width: 18, height: 18 }}>{L}</span>
                        <input className={inp + ' pl-10'} value={editQ.options[i] || ''} onChange={(e) => {
                          const opts = [...editQ.options]; opts[i] = e.target.value; setEditQ({ ...editQ, options: opts });
                        }} />
                      </div>
                    </Field>
                  ))}
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Correct answer">
                      <div className="relative">
                        <select className={inp + ' appearance-none pr-9'} value={editQ.answer ?? 0} onChange={(e) => setEditQ({ ...editQ, answer: +e.target.value })}>
                          {[0, 1, 2, 3].map((i) => <option key={i} value={i}>{String.fromCharCode(65 + i)}</option>)}
                        </select>
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><IconChevronDown className="w-3.5 h-3.5" /></span>
                      </div>
                    </Field>
                    <Field label="Marks"><input type="number" className={inp} value={editQ.marks} onChange={(e) => setEditQ({ ...editQ, marks: +e.target.value })} /></Field>
                  </div>
                  <Field label="Explanation (optional)"><textarea className={inp + ' min-h-[64px]'} value={editQ.explanation || ''} onChange={(e) => setEditQ({ ...editQ, explanation: e.target.value })} /></Field>
                  <div className="flex gap-2">
                    <button type="button" className={btnS + ' flex-1'} onClick={() => { setEditQ(null); setQMode('list'); }}>Cancel</button>
                    <button type="button" className={btnP + ' flex-1'} onClick={saveManualQ}><IconCheck className="w-3.5 h-3.5" /> Save question</button>
                  </div>
                </div>
              )}

              {qMode === 'json' && (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-slate-500">Paste an array of questions with fields: question, options[], answer (0–3), marks</p>
                  <textarea className={inp + ' min-h-[150px] font-mono text-[13px]'} value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder='[{"question":"...","options":["A","B","C","D"],"answer":0}]' />
                  <div className="flex gap-2">
                    <button type="button" className={btnS + ' flex-1'} onClick={() => setQMode('list')}>Cancel</button>
                    <button type="button" className={btnP + ' flex-1'} onClick={importJson}>Import</button>
                  </div>
                </div>
              )}

              {qMode === 'ocr' && (
                <div className="space-y-2.5">
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-center">
                    <div className="mx-auto w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 mb-1.5"><IconSparkles className="w-5 h-5" /></div>
                    <p className="text-xs text-slate-600">Upload a photo of questions. Gemini extracts MCQs — review them after.</p>
                  </div>
                  <label className={btnP + ' w-full cursor-pointer'}>
                    <IconUpload className="w-4 h-4" />
                    {ocrBusy ? 'Parsing…' : 'Choose photo'}
                    <input type="file" accept="image/*" className="hidden" disabled={ocrBusy}
                      onChange={(e) => e.target.files?.[0] && onOcr(e.target.files[0])} />
                  </label>
                  <button type="button" className={btnS + ' w-full'} onClick={() => setQMode('list')}>Back to list</button>
                </div>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-3">
              <div className={card + ' p-3.5 space-y-1 text-sm'}>
                <div className="font-bold text-base">{form.title || '(Untitled)'}</div>
                <div className="text-[12px] text-slate-500">{form.subject} · {form.className} · {form.durationMinutes} min</div>
                <div className="pt-1"><Badge s={form.status} /></div>
                <div className="text-[12px] text-slate-600 pt-1.5 flex items-center gap-1.5"><IconFileText className="w-3.5 h-3.5 text-blue-500" />{qs.length} questions · {qs.reduce((s, q) => s + (Number(q.marks) || 1), 0)} total marks</div>
              </div>
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-0.5">
                {qs.map((q, i) => (
                  <div key={q.id} className="border border-slate-200 rounded-lg p-2.5 text-[13px]">
                    <div className="font-semibold text-slate-400 text-[11px] mb-0.5">Q{i + 1}</div>
                    <div className="font-medium">{q.question}</div>
                    <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-600">
                      {(q.options || []).map((o, oi) => (
                        <div key={oi} className={`flex items-center gap-1.5 ${oi === q.answer ? 'text-emerald-700 font-semibold' : ''}`}>
                          <span className="w-3.5 h-3.5 rounded-md bg-slate-100 flex items-center justify-center text-[8px] font-bold shrink-0">{String.fromCharCode(65 + oi)}</span>
                          {o || '—'}
                          {oi === q.answer && <IconCheck className="w-3 h-3 text-emerald-600 shrink-0" />}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1"><IconInfo className="w-3 h-3 shrink-0" />Check every answer is correct before setting LIVE.</p>
              <div className="flex gap-2">
                <button type="button" className={btnS + ' flex-1'} onClick={() => setStep('questions')}>← Edit questions</button>
                <button type="button" className={btnP + ' flex-1'} disabled={saving} onClick={saveExam}>
                  {saving ? 'Saving…' : editId ? 'Update exam' : 'Create exam'}
                </button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

/* ─── RESULTS ─── */
function Results({ exams, attempts, students, onRefresh }: { exams: Exam[]; attempts: Attempt[]; students: Student[]; onRefresh: () => void }) {
  const [examId, setExamId] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);

  const official = attempts.filter((a) =>
    a.isOfficial !== false && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED')
  );
  const list = (examId ? official.filter((a) => a.examId === examId) : official)
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.timeTakenSeconds - b.timeTakenSeconds));
  const visible = showAll ? list : list.slice(0, 10);

  const findStudent = (a: Attempt) =>
    students.find((s) => (s.telegramUserId && a.telegramUserId && s.telegramUserId === a.telegramUserId) || s.studentId === a.studentId);

  const openDetail = async (attemptId: string) => {
    const res = await api(`/api/attempts/${attemptId}/detail`);
    const data = await res.json();
    if (res.ok) setDetail(data);
    else alert(data.error || 'Failed');
  };

  const removeAttempt = async (id: string) => {
    if (!confirm('Remove from leaderboard?')) return;
    await api(`/api/attempts/${id}`, { method: 'DELETE' });
    setDetail(null);
    onRefresh();
  };

  const removeStudent = async (studentId: string) => {
    if (!confirm('Delete student and all attempts?')) return;
    await api(`/api/students/${studentId}`, { method: 'DELETE' });
    setDetail(null);
    onRefresh();
  };

  const copyText = async () => {
    const lines = list.map((a, i) => `${a.rank || i + 1} - ${a.studentName} - ${a.score}`);
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied results text');
    } catch {
      prompt('Copy:', text);
    }
  };

  const exportCsv = async () => {
    const res = await api(`/api/results/export?examId=${examId || ''}`);
    if (!res.ok) return alert('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `results_${examId || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const msgStudent = (a: Attempt) => {
    const s = findStudent(a);
    if (s?.telegramUsername) window.open(`https://t.me/${s.telegramUsername.replace(/^@/, '')}`, '_blank');
    else if (s?.telegramUserId || a.telegramUserId) window.open(`tg://user?id=${s?.telegramUserId || a.telegramUserId}`, '_blank');
    else alert('No Telegram handle');
  };

  const initials = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';

  const rankStyle = (i: number) =>
    i === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-amber-950 shadow-sm shadow-amber-500/30'
      : i === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800 shadow-sm'
        : i === 2 ? 'bg-gradient-to-br from-orange-400 to-amber-600 text-orange-950 shadow-sm shadow-orange-500/20'
          : 'bg-slate-100 text-slate-600';

  const maxScore = list.length ? Math.max(...list.map((a) => a.score || 0)) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Results</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">Official only · Rank - Name - Marks</p>
        </div>
        <button type="button" className={btnS + ' !py-1.5 text-[11px]'} onClick={copyText}><IconCopy className="w-3.5 h-3.5" /> Copy text</button>
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconFilter className="w-3.5 h-3.5" /></span>
        <select className={inp + ' !py-1.5 pl-9 appearance-none pr-9'} value={examId} onChange={(e) => { setExamId(e.target.value); setShowAll(false); }}>
          <option value="">All exams</option>
          {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><IconChevronDown className="w-3.5 h-3.5" /></span>
      </div>

      <button type="button" className={btnS + ' w-full !py-1.5 text-[11px]'} onClick={exportCsv}><IconDownload className="w-3.5 h-3.5" /> Export CSV</button>

      <div className="space-y-1.5">
        {list.length === 0 && <div className={card + ' p-5 text-center text-sm text-slate-500'}>No official results yet</div>}
        {visible.map((a, i) => {
          const stu = findStudent(a);
          const barPct = maxScore ? Math.round((a.score / maxScore) * 100) : 0;
          return (
            <div key={a.id} className={card + ' p-2 flex items-center gap-2 relative overflow-hidden hover:shadow-md hover:shadow-slate-200/60 transition'}>
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-100">
                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${barPct}%` }} />
              </div>
              <div className={`w-7 h-7 rounded-full ${rankStyle(i)} flex items-center justify-center text-[11px] font-bold shrink-0 ring-1 ring-white shadow-sm`}>{a.rank || i + 1}</div>
              <button type="button" onClick={() => openDetail(a.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold shrink-0 ring-1 ring-white">{initials(a.studentName)}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[13px] text-slate-900 truncate">{a.studentName}</div>
                  <div className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                    <IconMessage className="w-2.5 h-2.5 shrink-0" />{stu?.telegramUsername || '—'} · {a.score} marks
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="inline-flex items-center gap-1 text-[13px] font-bold text-blue-600"><IconStar className="w-3 h-3 text-amber-500" />{a.percentage}%</span>
                </div>
              </button>
              <button type="button" className="text-[9px] font-bold text-slate-500 px-2 py-1 border border-slate-200 rounded-md shrink-0 hover:bg-slate-50" onClick={() => msgStudent(a)}><IconSend className="w-2.5 h-2.5" /> Msg</button>
            </div>
          );
        })}
      </div>
      {list.length > 10 && (
        <button type="button" className={btnS + ' w-full !py-1.5 text-[11px]'} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show top 10' : `Show more (${list.length - 10} more)`}
        </button>
      )}
      {detail && (
        <Sheet title={detail.attempt?.studentName || 'Detail'} onClose={() => setDetail(null)}>
          <div className="space-y-3 text-sm">
            <div className={card + ' p-3.5 space-y-2 relative overflow-hidden'}>
              <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-blue-50" />
              <div className="relative grid grid-cols-1 gap-1.5 text-[13px]">
                <div className="flex items-center gap-2"><IconUser className="w-3.5 h-3.5 text-slate-400" /><strong>{detail.attempt.studentName}</strong></div>
                <div className="flex items-center gap-2 text-slate-600"><IconMessage className="w-3.5 h-3.5 text-slate-400" />{findStudent(detail.attempt)?.telegramUsername || '—'}</div>
                <div className="flex items-center gap-2 text-slate-600"><IconHash className="w-3.5 h-3.5 text-slate-400" />{detail.attempt.studentId}</div>
                <div className="flex items-center gap-2 text-slate-600"><IconFileText className="w-3.5 h-3.5 text-slate-400" />{detail.exam?.title}</div>
                <div className="flex items-center gap-2"><IconStar className="w-3.5 h-3.5 text-amber-500" />{detail.attempt.score}/{detail.attempt.maxScore} ({detail.attempt.percentage}%)</div>
                <div className="flex items-center gap-2 text-slate-600"><IconTimer className="w-3.5 h-3.5 text-slate-400" />{Math.floor(detail.attempt.timeTakenSeconds / 60)}m {detail.attempt.timeTakenSeconds % 60}s</div>
              </div>
              <button type="button" className={btnP + ' w-full text-xs mt-1 relative'}>
                <IconMessage className="w-3.5 h-3.5" /> Message on Telegram
              </button>
            </div>
            <div className="font-bold text-[11px] text-slate-500 uppercase tracking-wide">Question-wise</div>
            <div className="space-y-1.5 max-h-[35vh] overflow-y-auto pr-0.5">
              {(detail.breakdown || []).map((b: any) => (
                <div key={b.questionId} className={`rounded-lg border p-2 text-[11px] ${b.status === 'correct' ? 'border-emerald-200 bg-emerald-50' : b.status === 'wrong' ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                  <div className="font-bold text-slate-500 flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${b.status === 'correct' ? 'bg-emerald-500' : b.status === 'wrong' ? 'bg-red-500' : 'bg-slate-300'}`} />
                    Q{b.index} · {b.status}
                  </div>
                  <div className="font-medium text-[13px] text-slate-800 mt-0.5">{b.question}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className={btnD + ' flex-1 border border-red-100 rounded-lg py-2'} onClick={() => removeAttempt(detail.attempt.id)}>Remove result</button>
              {findStudent(detail.attempt) && (
                <button type="button" className={btnD + ' flex-1 border border-red-100 rounded-lg py-2'} onClick={() => removeStudent(findStudent(detail.attempt)!.id)}>Delete student</button>
              )}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ─── SETTINGS ─── */
function Settings({ settings, logs, onRefresh }: { settings: SystemSettings; logs: AuditLog[]; onRefresh: () => void }) {
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [broadcast, setBroadcast] = useState('');
  const [bcastBusy, setBcastBusy] = useState(false);
  useEffect(() => setForm(settings), [settings]);

  const save = async () => {
    setBusy(true);
    try {
      let res = await api('/api/settings', { method: 'PUT', body: JSON.stringify(form) });
      if (!res.ok) res = await api('/api/settings', { method: 'POST', body: JSON.stringify(form) });
      if (!res.ok) throw new Error('Save failed');
      onRefresh();
      alert('Saved');
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const sendBroadcast = async () => {
    if (!broadcast.trim()) return alert('Enter a message');
    if (!confirm('Send to all students via the bot?')) return;
    setBcastBusy(true);
    try {
      const res = await api('/api/broadcast', { method: 'POST', body: JSON.stringify({ message: broadcast.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      alert(`Sent to ${data.sent} students` + (data.failed ? ` (${data.failed} failed)` : ''));
      setBroadcast('');
    } catch (e: any) {
      alert(e.message || 'Broadcast failed');
    } finally {
      setBcastBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold tracking-tight text-slate-900">Settings</h1>

      <SectionTitle icon={<IconSettings className="w-3.5 h-3.5" />} title="General" sub="System notice & exam intake" />
      <div className={card + ' p-3.5 space-y-2.5'}>
        <p className="text-[11px] text-slate-500 flex items-start gap-1.5"><IconInfo className="w-3 h-3 mt-0.5 shrink-0" />Bot token & username are set by the developer and cannot be changed here.</p>
        <Field label="System notice"><textarea className={inp} value={form.systemNotice} onChange={(e) => setForm({ ...form, systemNotice: e.target.value })} /></Field>
        <label className={`flex items-center justify-between gap-2 text-[13px] cursor-pointer rounded-lg border px-3 py-2.5 transition ${form.botActive ? 'border-emerald-200 bg-emerald-50/50 text-emerald-800' : 'border-slate-200 hover:border-slate-300'}`}>
          <span>Accept new exam attempts</span>
          <input type="checkbox" checked={form.botActive} onChange={(e) => setForm({ ...form, botActive: e.target.checked })} className="accent-emerald-600" style={{ width: 18, height: 18 }} />
        </label>
        <button type="button" className={btnP + ' w-full !py-2'} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>

      <SectionTitle icon={<IconSend className="w-3.5 h-3.5" />} title="Message all students" sub="Sends via Telegram bot to every linked student" />
      <div className={card + ' p-3.5 space-y-2.5'}>
        <textarea className={inp + ' min-h-[80px]'} value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="Type your announcement…" />
        <button type="button" className={btnP + ' w-full !py-2'} disabled={bcastBusy} onClick={sendBroadcast}>
          {bcastBusy ? 'Sending…' : 'Send to all students'}
        </button>
      </div>

      {logs.length > 0 && (
        <>
          <SectionTitle icon={<IconChart className="w-3.5 h-3.5" />} title="Audit log" sub="Recent activity" />
          <div className={card + ' divide-y divide-slate-100'}>
            {logs.map((l) => (
              <div key={l.id} className="p-2.5 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-slate-700">{l.action.replace(/_/g, ' ')}</div>
                  {l.details && <div className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{l.details}</div>}
                  <div className="text-[9px] text-slate-400 mt-0.5">{formatIST(l.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={card + ' p-3.5 border-red-100'}>
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-red-600 mb-0.5"><IconAlert className="w-3.5 h-3.5" /> Danger zone</div>
        <p className="text-[11px] text-slate-500 mb-2.5">Permanently reset all exams, results and students back to the clean seed state.</p>
        <button type="button" className={btnD + ' w-full border border-red-100 rounded-lg py-2 bg-red-50/50 hover:bg-red-50'} onClick={async () => {
          if (!confirm('Reset ALL data?')) return;
          await api('/api/reseed', { method: 'POST' });
          onRefresh();
        }}><IconTrash className="w-3.5 h-3.5" /> Reset all data</button>
      </div>
    </div>
  );
}
