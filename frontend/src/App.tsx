import React, { useState, useEffect, useCallback } from 'react';
import { api, getToken, setToken, clearToken } from './api';
import type { Exam, Question, Attempt, SystemSettings, AuditLog, ExamStatus, Student } from './types';
import {
  IconHome, IconExam, IconResults, IconSettings, IconPlus, IconTrash, IconEdit,
  IconLogout, IconCheck, IconUpload, IconEye, IconEyeOff, IconBot, IconRefresh,
  IconClose, IconUsers, IconLive
} from './icons';

type Tab = 'home' | 'exams' | 'results' | 'settings';

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SCHEDULED: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  LIVE: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  ENDED: 'bg-slate-100 text-slate-500',
  RESULTS_PUBLISHED: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
};

const inp = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-400';
const btn = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';
const btnP = btn + ' bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/20 px-4 py-3';
const btnS = btn + ' bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 px-4 py-3';
const btnD = btn + ' text-red-600 hover:bg-red-50 px-3 py-2';
const card = 'bg-white rounded-2xl border border-slate-200/80 shadow-sm';

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


function Badge({ s }: { s: string }) {
  return <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${STATUS_STYLE[s] || STATUS_STYLE.DRAFT}`}>{s.replace(/_/g, ' ')}</span>;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl safe-pb">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 backdrop-blur px-4 py-3.5 rounded-t-3xl">
          <h2 className="text-base font-bold text-slate-900 truncate">{title}</h2>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 shrink-0" aria-label="Close">
            <IconClose className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 pb-8">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
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
    <div className="min-h-full flex flex-col items-center justify-center p-5 bg-gradient-to-b from-blue-50 via-slate-50 to-slate-100">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 mb-4">
            <IconBot className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Quiz Bot by Pusparghya</h1>
          <p className="text-sm text-slate-500 mt-1">Teacher Dashboard</p>
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-4">
          <button type="button" onClick={() => { setMode('login'); setErr(''); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold ${mode === 'login' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>
            Sign in
          </button>
          <button type="button" onClick={() => { setMode('register'); setErr(''); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold ${mode === 'register' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>
            Register
          </button>
        </div>

        <form onSubmit={go} className={card + ' p-5 space-y-4'}>
          {mode === 'register' && (
            <Field label="Full name">
              <input className={inp} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" />
            </Field>
          )}
          <Field label="Username">
            <input className={inp} value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoCapitalize="off" required placeholder="Choose a username" />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input className={inp + ' pr-12'} type={show ? 'text' : 'password'} value={p} onChange={(e) => setP(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required placeholder={mode === 'register' ? 'Min 6 characters' : 'Password'} />
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400">
                {show ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}
              </button>
            </div>
          </Field>
          {err && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2.5">{err}</div>}
          <button type="submit" disabled={busy} className={btnP + ' w-full'}>
            {busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>
        <p className="text-center text-xs text-slate-400 mt-6">Quiz Bot by Pusparghya</p>
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
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200/80">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <IconBot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-slate-900 leading-tight">Quiz Bot by Pusparghya</div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${settings.botActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {settings.botActive ? 'Bot online' : 'Bot offline'}
              </div>
            </div>
          </div>
          <button type="button" onClick={() => { clearToken(); setAuthed(false); }} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100" aria-label="Logout">
            <IconLogout className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 pt-4 safe-pb">
        {loading && exams.length === 0 ? (
          <div className="py-20 text-center text-slate-500 text-sm">Loading…</div>
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
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]" style={{ paddingBottom: 'max(var(--safe-bottom), 8px)' }}>
        <div className="max-w-3xl mx-auto grid grid-cols-4 h-[60px]">
          {nav.map(({ id, label, Icon }) => {
            const on = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${on ? 'text-blue-600' : 'text-slate-400'}`}
              >
                <Icon className={`w-5 h-5 ${on ? 'stroke-[2.5]' : ''}`} />
                {label}
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
  const uniqueStudents = (() => {
    const map = new Map<string, Student>();
    for (const s of students) {
      const key = s.telegramUserId ? `tg:${s.telegramUserId}` : `id:${s.id}`;
      if (!map.has(key)) map.set(key, s);
    }
    return [...map.values()];
  })();
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
  if (profile) {
    const list = studentAttempts(profile);
    const msg = tgLink(profile);
    return (
      <div className="space-y-3">
        <button type="button" className="text-sm font-semibold text-blue-600" onClick={() => setProfile(null)}>← Back</button>
        <div className={card + ' p-3 space-y-1'}>
          <div className="font-bold text-base">👤 {profile.name}</div>
          <div className="text-xs text-slate-500">💬 {profile.telegramUsername || '—'}</div>
          <div className="text-xs text-slate-500">🆔 {profile.studentId}</div>
          {msg && (
            <a href={msg} target="_blank" rel="noreferrer" className={btnP + ' w-full mt-2 text-sm no-underline'}>Message on Telegram</a>
          )}
        </div>
        <h2 className="font-bold text-sm">Exams & results</h2>
        {list.length === 0 && <p className="text-sm text-slate-500">No attempts yet</p>}
        <div className="space-y-2">
          {list.map((a) => {
            const exam = examList.find((e) => e.id === a.examId);
            const practice = a.isOfficial === false;
            return (
              <div key={a.id} className={card + ' p-3'}>
                <div className="font-semibold text-sm">{exam?.title || a.examId}</div>
                <div className="text-xs text-slate-500 mt-0.5">{practice ? '🔁 Practice' : '📌 Official'} · {a.status.replace(/_/g, ' ')}</div>
                <div className="text-sm mt-1">⭐ {a.score}/{a.maxScore} ({a.percentage}%) · ⏱️ {Math.floor(a.timeTakenSeconds / 60)}m {a.timeTakenSeconds % 60}s{a.rank ? ` · #${a.rank}` : ''}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Home</h1>
          <p className="text-xs text-slate-500">Quiz Bot by Pusparghya</p>
        </div>
        <button type="button" onClick={onExams} className={btnP + ' !py-2 !px-3 text-xs'}><IconPlus className="w-4 h-4" /> Exam</button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[{ label: 'Exams', value: exams }, { label: 'Live', value: live }, { label: 'Subs', value: submissions }, { label: 'Students', value: ranked.length }].map((c) => (
          <div key={c.label} className={card + ' p-2.5 text-center'}>
            <div className="text-lg font-bold">{c.value}</div>
            <div className="text-[10px] text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>
      <h2 className="font-bold text-sm pt-1">Students · by performance</h2>
      {ranked.length === 0 ? (
        <div className={card + ' p-4 text-sm text-slate-500'}>No students yet</div>
      ) : (
        <div className="space-y-1.5">
          {ranked.map((s, i) => {
            const perf = performance(s);
            return (
              <button key={s.id} type="button" onClick={() => setProfile(s)} className={card + ' p-2.5 w-full text-left flex items-center gap-2 hover:border-blue-300'}>
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">👤 {s.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">💬 {s.telegramUsername || '—'} · 🆔 {s.studentId}</div>
                </div>
                <div className="text-xs font-bold text-blue-600 shrink-0">{perf < 0 ? '—' : `${perf}%`}</div>
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Exams</h1>
          <p className="text-sm text-slate-500">{exams.length} total</p>
        </div>
        <button type="button" className={btnP} onClick={startCreate}>
          <IconPlus className="w-4 h-4" /> New
        </button>
      </div>

      <input className={inp} placeholder="Search exams…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {shareLink && (
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-3 text-sm break-all">
          <div className="font-semibold text-blue-800 mb-1">Student exam link</div>
          <a href={shareLink} className="text-blue-600 underline" target="_blank" rel="noreferrer">{shareLink}</a>
          <p className="text-xs text-blue-700/80 mt-1">Share this with students. Only this link starts the exam.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className={card + ' p-8 text-center text-slate-500 text-sm'}>
            No exams yet. Tap <strong>New</strong> to create one.
          </div>
        )}
        {filtered.map((exam) => (
          <div key={exam.id} className={card + ' p-4'}>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-900 leading-snug">{exam.title}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {exam.subject || '—'} · {exam.className || '—'} · {exam.totalQuestions || exam.questions?.length || 0} Qs · {exam.durationMinutes}m
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Starts: {formatIST(exam.startDate)}</div>
                <div className="mt-2.5"><Badge s={exam.status} /></div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button type="button" className="w-10 h-10 rounded-xl border border-blue-100 flex items-center justify-center text-blue-600 hover:bg-blue-50 text-[10px] font-bold" onClick={() => copyLink(exam.id)} aria-label="Share">
                  Share
                </button>
                <button type="button" className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50" onClick={() => startEdit(exam)} aria-label="Edit">
                  <IconEdit className="w-4 h-4" />
                </button>
                <button type="button" className="w-10 h-10 rounded-xl border border-red-100 flex items-center justify-center text-red-500 hover:bg-red-50" onClick={() => delExam(exam.id)} aria-label="Delete">
                  <IconTrash className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <Sheet title={editId ? 'Edit exam' : 'New exam'} onClose={() => setOpen(false)}>
          {/* Steps */}
          <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl">
            {([
              { id: 'info', label: '1. Info' },
              { id: 'questions', label: '2. Questions' },
              { id: 'review', label: '3. Review' },
            ] as const).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold ${step === s.id ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {step === 'info' && (
            <div className="space-y-3">
              <Field label="Exam title"><input className={inp} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Biology Unit Test 3" /></Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Subject"><input className={inp} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
                <Field label="Class / group"><input className={inp} value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} /></Field>
                <Field label="Test code"><input className={inp} value={form.testNumber} onChange={(e) => setForm({ ...form, testNumber: e.target.value })} /></Field>
                <Field label="Start time"><input type="datetime-local" className={inp} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
                <Field label="Duration (minutes)"><input type="number" className={inp} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: +e.target.value })} /></Field>
                <Field label="Negative marking"><input type="number" step="0.25" className={inp} value={form.negativeMarking} onChange={(e) => setForm({ ...form, negativeMarking: +e.target.value })} /></Field>
              </div>
              <Field label="Status">
                <select className={inp} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ExamStatus })}>
                  {['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'RESULTS_PUBLISHED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </Field>
              <div className="flex flex-col gap-2 text-sm pt-1">
                <label className="flex items-center gap-2.5"><input type="checkbox" checked={form.randomizeQuestions} onChange={(e) => setForm({ ...form, randomizeQuestions: e.target.checked })} /> Shuffle questions</label>
                <label className="flex items-center gap-2.5"><input type="checkbox" checked={form.randomizeOptions} onChange={(e) => setForm({ ...form, randomizeOptions: e.target.checked })} /> Shuffle options</label>
              </div>
              <button type="button" className={btnP + ' w-full mt-2'} onClick={() => setStep('questions')}>Next: Questions →</button>
            </div>
          )}

          {step === 'questions' && (
            <div className="space-y-4">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                {([
                  { id: 'list', label: 'List' },
                  { id: 'ocr', label: 'Photo' },
                  { id: 'manual', label: 'Manual' },
                  { id: 'json', label: 'JSON' },
                ] as const).map((m) => (
                  <button key={m.id} type="button" onClick={() => { setQMode(m.id); if (m.id === 'manual') addManual(); }}
                    className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${qMode === m.id ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>
                    {m.label}
                  </button>
                ))}
              </div>

              {toast && <div className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 flex items-center gap-2"><IconCheck className="w-4 h-4" />{toast}</div>}

              {qMode === 'list' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">{qs.length} questions</span>
                    <button type="button" className={btnS + ' !py-2 text-sm'} onClick={addManual}><IconPlus className="w-4 h-4" /> Add</button>
                  </div>
                  {qs.length === 0 && <p className="text-sm text-slate-500 text-center py-6">No questions yet. Use Photo, Manual, or JSON.</p>}
                  <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                    {qs.map((q, i) => (
                      <div key={q.id} className="border border-slate-200 rounded-xl p-3">
                        <div className="text-[11px] text-slate-400 font-semibold mb-1">Q{i + 1} · Ans {String.fromCharCode(65 + (q.answer ?? 0))} · {q.marks} mark</div>
                        <div className="text-sm font-medium text-slate-800 line-clamp-2">{q.question}</div>
                        <div className="flex gap-2 mt-2">
                          <button type="button" className={btnS + ' !py-1.5 text-xs'} onClick={() => { setEditQ({ ...q, options: [...q.options] }); setQMode('manual'); }}>Edit</button>
                          <button type="button" className={btnD + ' text-xs'} onClick={() => setQs((p) => p.filter((x) => x.id !== q.id))}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="button" className={btnS + ' flex-1'} onClick={() => setStep('info')}>← Back</button>
                    <button type="button" className={btnP + ' flex-1'} onClick={() => setStep('review')}>Review →</button>
                  </div>
                </>
              )}

              {qMode === 'manual' && editQ && (
                <div className="space-y-3">
                  <Field label="Question"><textarea className={inp + ' min-h-[88px]'} value={editQ.question} onChange={(e) => setEditQ({ ...editQ, question: e.target.value })} /></Field>
                  {['A', 'B', 'C', 'D'].map((L, i) => (
                    <Field key={L} label={`Option ${L}`}>
                      <input className={inp} value={editQ.options[i] || ''} onChange={(e) => {
                        const opts = [...editQ.options]; opts[i] = e.target.value; setEditQ({ ...editQ, options: opts });
                      }} />
                    </Field>
                  ))}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Correct answer">
                      <select className={inp} value={editQ.answer ?? 0} onChange={(e) => setEditQ({ ...editQ, answer: +e.target.value })}>
                        {[0, 1, 2, 3].map((i) => <option key={i} value={i}>{String.fromCharCode(65 + i)}</option>)}
                      </select>
                    </Field>
                    <Field label="Marks"><input type="number" className={inp} value={editQ.marks} onChange={(e) => setEditQ({ ...editQ, marks: +e.target.value })} /></Field>
                  </div>
                  <Field label="Explanation (optional)"><textarea className={inp} value={editQ.explanation || ''} onChange={(e) => setEditQ({ ...editQ, explanation: e.target.value })} /></Field>
                  <div className="flex gap-2">
                    <button type="button" className={btnS + ' flex-1'} onClick={() => { setEditQ(null); setQMode('list'); }}>Cancel</button>
                    <button type="button" className={btnP + ' flex-1'} onClick={saveManualQ}>Save question</button>
                  </div>
                </div>
              )}

              {qMode === 'json' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">Paste an array of questions with fields: question, options[], answer (0–3), marks</p>
                  <textarea className={inp + ' min-h-[160px] font-mono text-sm'} value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder='[{"question":"...","options":["A","B","C","D"],"answer":0}]' />
                  <div className="flex gap-2">
                    <button type="button" className={btnS + ' flex-1'} onClick={() => setQMode('list')}>Cancel</button>
                    <button type="button" className={btnP + ' flex-1'} onClick={importJson}>Import</button>
                  </div>
                </div>
              )}

              {qMode === 'ocr' && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">Upload a photo of questions. Gemini extracts MCQs — review them after.</p>
                  <label className={btnP + ' w-full cursor-pointer'}>
                    <IconUpload className="w-5 h-5" />
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
            <div className="space-y-4">
              <div className={card + ' p-4 space-y-1 text-sm'}>
                <div className="font-bold text-base">{form.title || '(Untitled)'}</div>
                <div className="text-slate-500">{form.subject} · {form.className} · {form.durationMinutes} min</div>
                <div className="pt-1"><Badge s={form.status} /></div>
                <div className="text-slate-600 pt-2">{qs.length} questions · {qs.reduce((s, q) => s + (Number(q.marks) || 1), 0)} total marks</div>
              </div>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {qs.map((q, i) => (
                  <div key={q.id} className="border border-slate-200 rounded-xl p-3 text-sm">
                    <div className="font-semibold text-slate-400 text-xs mb-1">Q{i + 1}</div>
                    <div className="font-medium">{q.question}</div>
                    <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                      {(q.options || []).map((o, oi) => (
                        <div key={oi} className={oi === q.answer ? 'text-emerald-700 font-semibold' : ''}>
                          {String.fromCharCode(65 + oi)}. {o || '—'}{oi === q.answer ? ' ✓' : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">Check every answer is correct before setting LIVE.</p>
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">Results</h1>
          <p className="text-xs text-slate-500">Official only · Rank - Name - Marks</p>
        </div>
        <button type="button" className={btnS + ' !py-2 text-xs'} onClick={copyText}>Copy text</button>
      </div>
      <select className={inp + ' !py-2.5'} value={examId} onChange={(e) => { setExamId(e.target.value); setShowAll(false); }}>
        <option value="">All exams</option>
        {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
      </select>
      <button type="button" className={btnS + ' w-full !py-2 text-xs'} onClick={exportCsv}>Export CSV</button>
      <div className="space-y-1.5">
        {list.length === 0 && <div className={card + ' p-6 text-center text-sm text-slate-500'}>No official results yet</div>}
        {visible.map((a, i) => {
          const stu = findStudent(a);
          return (
            <div key={a.id} className={card + ' p-2.5 flex items-center gap-2'}>
              <button type="button" onClick={() => openDetail(a.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold shrink-0">{a.rank || i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate text-blue-700">👤 {a.studentName}</div>
                  <div className="text-[11px] text-slate-500 truncate">💬 {stu?.telegramUsername || '—'} · {a.score} marks</div>
                </div>
                <div className="font-bold text-sm text-blue-600 shrink-0">{a.percentage}%</div>
              </button>
              <button type="button" className="text-[10px] font-bold text-slate-500 px-2 py-1 border border-slate-200 rounded-lg shrink-0" onClick={() => msgStudent(a)}>Msg</button>
            </div>
          );
        })}
      </div>
      {list.length > 10 && (
        <button type="button" className={btnS + ' w-full !py-2 text-xs'} onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show top 10' : `Show more (${list.length - 10} more)`}
        </button>
      )}
      {detail && (
        <Sheet title={detail.attempt?.studentName || 'Detail'} onClose={() => setDetail(null)}>
          <div className="space-y-3 text-sm">
            <div className={card + ' p-3 space-y-1'}>
              <div>👤 <strong>{detail.attempt.studentName}</strong></div>
              <div>💬 {findStudent(detail.attempt)?.telegramUsername || '—'}</div>
              <div>🆔 {detail.attempt.studentId}</div>
              <div>📝 {detail.exam?.title}</div>
              <div>⭐ {detail.attempt.score}/{detail.attempt.maxScore} ({detail.attempt.percentage}%)</div>
              <div>⏱️ {Math.floor(detail.attempt.timeTakenSeconds / 60)}m {detail.attempt.timeTakenSeconds % 60}s</div>
            </div>
            <button type="button" className={btnP + ' w-full text-sm'} onClick={() => msgStudent(detail.attempt)}>Message on Telegram</button>
            <div className="font-bold text-xs">Question-wise</div>
            <div className="space-y-1.5 max-h-[35vh] overflow-y-auto">
              {(detail.breakdown || []).map((b: any) => (
                <div key={b.questionId} className={`border rounded-lg p-2 text-xs ${b.status === 'correct' ? 'border-emerald-200 bg-emerald-50' : b.status === 'wrong' ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                  <div className="font-bold text-slate-500">Q{b.index} · {b.status}</div>
                  <div className="font-medium text-sm">{b.question}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className={btnD + ' flex-1 border border-red-100 rounded-xl py-2.5'} onClick={() => removeAttempt(detail.attempt.id)}>Remove result</button>
              {findStudent(detail.attempt) && (
                <button type="button" className={btnD + ' flex-1 border border-red-100 rounded-xl py-2.5'} onClick={() => removeStudent(findStudent(detail.attempt)!.id)}>Delete student</button>
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
      <h1 className="text-lg font-bold">Settings</h1>
      <div className={card + ' p-3 space-y-2.5'}>
        <p className="text-xs text-slate-500">Bot token & username are set by the developer and cannot be changed here.</p>
        <Field label="System notice"><textarea className={inp} value={form.systemNotice} onChange={(e) => setForm({ ...form, systemNotice: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.botActive} onChange={(e) => setForm({ ...form, botActive: e.target.checked })} /> Accept new exam attempts</label>
        <button type="button" className={btnP + ' w-full !py-2.5'} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <div className={card + ' p-3 space-y-2.5'}>
        <h2 className="font-bold text-sm">📢 Message all students</h2>
        <p className="text-xs text-slate-500">Sends via Telegram bot to every linked student.</p>
        <textarea className={inp + ' min-h-[88px]'} value={broadcast} onChange={(e) => setBroadcast(e.target.value)} placeholder="Type your announcement…" />
        <button type="button" className={btnP + ' w-full !py-2.5'} disabled={bcastBusy} onClick={sendBroadcast}>
          {bcastBusy ? 'Sending…' : 'Send to all students'}
        </button>
      </div>
      <button type="button" className={btnD + ' w-full border border-red-100 rounded-xl py-2.5'} onClick={async () => {
        if (!confirm('Reset ALL data?')) return;
        await api('/api/reseed', { method: 'POST' });
        onRefresh();
      }}>Reset all data</button>
    </div>
  );
}
