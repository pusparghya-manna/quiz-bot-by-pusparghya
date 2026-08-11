import React, { useState, useEffect, useCallback } from 'react';
import { api, getToken, setToken, clearToken } from './api';
import type { Exam, Question, Student, Attempt, SystemSettings, AuditLog, ExamStatus } from './types';

type Tab = 'home' | 'exams' | 'questions' | 'results' | 'settings';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SCHEDULED: 'bg-amber-100 text-amber-700',
  LIVE: 'bg-emerald-100 text-emerald-700',
  ENDED: 'bg-slate-100 text-slate-500',
  RESULTS_PUBLISHED: 'bg-blue-100 text-blue-700',
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_COLOR[status] || 'bg-slate-100 text-slate-600'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className={`bg-white w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between z-10">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2">×</button>
        </div>
        <div className="p-4">{children}</div>
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

const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const btnPrimary = 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl px-4 py-2.5 disabled:opacity-50';
const btnGhost = 'border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl px-3 py-2';
const btnDanger = 'text-red-600 hover:bg-red-50 font-medium rounded-xl px-3 py-2';

/* ───────────── LOGIN ───────────── */
function Login({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Invalid credentials');
      setToken(data.token);
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-blue-600 text-white items-center justify-center text-2xl font-bold mb-3">T</div>
          <h1 className="text-xl font-bold">TeleExam Pro</h1>
          <p className="text-sm text-slate-500 mt-1">Teacher Dashboard</p>
        </div>
        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <Field label="Username">
            <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="off" required placeholder="Username" />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input className={inputCls + ' pr-16'} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required placeholder="Password" />
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 px-2 py-1">
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading} className={btnPrimary + ' w-full'}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}

/* ───────────── MAIN APP ───────────── */
export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [tab, setTab] = useState<Tab>('home');
  const [loading, setLoading] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    telegramBotToken: '', webhookUrl: '', botUsername: '@ExamMasterBot',
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
      setQuestions(d.questions || []);
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

  useEffect(() => { if (authed) load(); }, [authed, load]);

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'exams', label: 'Exams' },
    { id: 'questions', label: 'Questions' },
    { id: 'results', label: 'Results' },
    { id: 'settings', label: 'Settings' },
  ];

  const liveCount = exams.filter((e) => e.status === 'LIVE' || e.status === 'SCHEDULED').length;
  const linked = students.filter((s) => s.status === 'linked').length;
  const submitted = attempts.filter((a) => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED');

  return (
    <div className="min-h-full flex flex-col bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-3 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">T</div>
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">TeleExam Pro</div>
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${settings.botActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {settings.botActive ? 'Bot active' : 'Bot off'}
              </div>
            </div>
          </div>
          <button type="button" onClick={() => { clearToken(); setAuthed(false); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1">
            Logout
          </button>
        </div>
        {/* Tabs */}
        <nav className="max-w-5xl mx-auto px-2 flex gap-1 overflow-x-auto scrollbar-none pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                tab === t.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-3 py-4 pb-24">
        {loading && exams.length === 0 ? (
          <p className="text-center text-slate-500 py-16 text-sm">Loading…</p>
        ) : (
          <>
            {tab === 'home' && (
              <HomeTab
                exams={exams.length}
                live={liveCount}
                students={students.length}
                linked={linked}
                submissions={submitted.length}
                questions={questions.length}
                onGo={setTab}
              />
            )}
            {tab === 'exams' && <ExamsTab exams={exams} questions={questions} onRefresh={load} />}
            {tab === 'questions' && <QuestionsTab questions={questions} onRefresh={load} />}
            {tab === 'results' && <ResultsTab exams={exams} attempts={attempts} onRefresh={load} />}
            {tab === 'settings' && <SettingsTab settings={settings} logs={logs} onRefresh={load} />}
          </>
        )}
      </main>
    </div>
  );
}

function HomeTab({ exams, live, students, linked, submissions, questions, onGo }: any) {
  const cards = [
    { label: 'Exams', value: exams, tab: 'exams' as Tab },
    { label: 'Live / Scheduled', value: live, tab: 'exams' as Tab },
    { label: 'Students', value: students, tab: 'home' as Tab },
    { label: 'Linked', value: linked, tab: 'home' as Tab },
    { label: 'Submissions', value: submissions, tab: 'results' as Tab },
    { label: 'Question bank', value: questions, tab: 'questions' as Tab },
  ];
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Dashboard</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <button key={c.label} type="button" onClick={() => onGo(c.tab)} className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-blue-300 transition">
            <div className="text-2xl font-bold text-slate-900">{c.value}</div>
            <div className="text-xs text-slate-500 mt-1">{c.label}</div>
          </button>
        ))}
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-900">
        Tip: Create questions via photo OCR or JSON, then create an exam and set it LIVE. Students take it on Telegram.
      </div>
    </div>
  );
}

/* ───────────── EXAMS ───────────── */
function ExamsTab({ exams, questions, onRefresh }: { exams: Exam[]; questions: Question[]; onRefresh: () => void }) {
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [edit, setEdit] = useState<Exam | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', subject: '', className: '', testNumber: '', startDate: '',
    durationMinutes: 60, negativeMarking: 0, status: 'DRAFT' as ExamStatus,
    randomizeQuestions: false, randomizeOptions: false,
    resultVisibility: 'PUBLISHED' as const, leaderboardVisibility: 'PUBLISHED' as const,
    selectedQuestionIds: [] as string[],
  });

  const filtered = exams.filter((e) => {
    const s = q.toLowerCase();
    return !s || e.title.toLowerCase().includes(s) || e.subject.toLowerCase().includes(s);
  });

  const openCreate = () => {
    setEdit(null);
    setForm({
      title: '', subject: '', className: '', testNumber: '', startDate: new Date().toISOString().slice(0, 16),
      durationMinutes: 60, negativeMarking: 0, status: 'DRAFT',
      randomizeQuestions: false, randomizeOptions: false,
      resultVisibility: 'PUBLISHED', leaderboardVisibility: 'PUBLISHED',
      selectedQuestionIds: [],
    });
    setModal('create');
  };

  const openEdit = (exam: Exam) => {
    setEdit(exam);
    setForm({
      title: exam.title, subject: exam.subject, className: exam.className, testNumber: exam.testNumber,
      startDate: exam.startDate?.slice(0, 16) || '', durationMinutes: exam.durationMinutes,
      negativeMarking: exam.negativeMarking, status: exam.status,
      randomizeQuestions: exam.randomizeQuestions, randomizeOptions: exam.randomizeOptions,
      resultVisibility: exam.resultVisibility as any, leaderboardVisibility: exam.leaderboardVisibility as any,
      selectedQuestionIds: (exam.questions || []).map((x) => x.id),
    });
    setModal('edit');
  };

  const save = async () => {
    setSaving(true);
    try {
      const selectedQs = questions.filter((x) => form.selectedQuestionIds.includes(x.id));
      const body = {
        title: form.title, subject: form.subject, className: form.className, testNumber: form.testNumber,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : new Date().toISOString(),
        durationMinutes: Number(form.durationMinutes), negativeMarking: Number(form.negativeMarking),
        status: form.status, randomizeQuestions: form.randomizeQuestions, randomizeOptions: form.randomizeOptions,
        resultVisibility: form.resultVisibility, leaderboardVisibility: form.leaderboardVisibility,
        questions: selectedQs, totalQuestions: selectedQs.length,
        totalMarks: selectedQs.reduce((s, x) => s + (x.marks || 1), 0),
      };
      const res = edit
        ? await api(`/api/exams/${edit.id}`, { method: 'PUT', body: JSON.stringify({ ...edit, ...body }) })
        : await api('/api/exams', { method: 'POST', body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Save failed');
      setModal(null);
      onRefresh();
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm('Delete this exam?')) return;
    await api(`/api/exams/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <h2 className="text-lg font-bold">Exams</h2>
        <button type="button" className={btnPrimary} onClick={openCreate}>+ New exam</button>
      </div>
      <input className={inputCls} placeholder="Search exams…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-slate-500 py-8 text-center">No exams yet</p>}
        {filtered.map((exam) => (
          <div key={exam.id} className="bg-white border border-slate-200 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 truncate">{exam.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{exam.subject} · {exam.className} · {exam.totalQuestions} Qs</div>
                <div className="mt-2"><Badge status={exam.status} /></div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" className={btnGhost} onClick={() => openEdit(exam)}>Edit</button>
                <button type="button" className={btnDanger} onClick={() => del(exam.id)}>Del</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={edit ? 'Edit exam' : 'New exam'} onClose={() => setModal(null)} wide>
          <div className="space-y-3">
            <Field label="Title"><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Subject"><input className={inputCls} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
              <Field label="Class / Group"><input className={inputCls} value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} /></Field>
              <Field label="Test code"><input className={inputCls} value={form.testNumber} onChange={(e) => setForm({ ...form, testNumber: e.target.value })} /></Field>
              <Field label="Start"><input type="datetime-local" className={inputCls} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
              <Field label="Duration (min)"><input type="number" className={inputCls} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: +e.target.value })} /></Field>
              <Field label="Negative marking"><input type="number" step="0.25" className={inputCls} value={form.negativeMarking} onChange={(e) => setForm({ ...form, negativeMarking: +e.target.value })} /></Field>
              <Field label="Status">
                <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ExamStatus })}>
                  {['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'RESULTS_PUBLISHED'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.randomizeQuestions} onChange={(e) => setForm({ ...form, randomizeQuestions: e.target.checked })} /> Shuffle questions</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.randomizeOptions} onChange={(e) => setForm({ ...form, randomizeOptions: e.target.checked })} /> Shuffle options</label>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-2">Questions from bank ({form.selectedQuestionIds.length} selected)</div>
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y">
                {questions.length === 0 && <p className="p-3 text-xs text-slate-500">No questions in bank. Add some first.</p>}
                {questions.map((qq) => (
                  <label key={qq.id} className="flex items-start gap-2 p-2 text-sm hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.selectedQuestionIds.includes(qq.id)}
                      onChange={(e) => {
                        setForm({
                          ...form,
                          selectedQuestionIds: e.target.checked
                            ? [...form.selectedQuestionIds, qq.id]
                            : form.selectedQuestionIds.filter((id) => id !== qq.id),
                        });
                      }}
                    />
                    <span className="line-clamp-2">{qq.question}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" className={btnGhost + ' flex-1'} onClick={() => setModal(null)}>Cancel</button>
              <button type="button" className={btnPrimary + ' flex-1'} disabled={saving || !form.title} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ───────────── QUESTIONS ───────────── */
function QuestionsTab({ questions, onRefresh }: { questions: Question[]; onRefresh: () => void }) {
  const [sub, setSub] = useState<'bank' | 'ocr' | 'json'>('bank');
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Question | null>(null);
  const [form, setForm] = useState({ question: '', options: ['', '', '', ''], answer: 0, marks: 1, negativeMarks: 0, subject: '', explanation: '' });
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrPreview, setOcrPreview] = useState<any[]>([]);
  const [jsonText, setJsonText] = useState('');
  const [msg, setMsg] = useState('');

  const openNew = () => {
    setEdit(null);
    setForm({ question: '', options: ['', '', '', ''], answer: 0, marks: 1, negativeMarks: 0, subject: '', explanation: '' });
    setModal(true);
  };
  const openEdit = (q: Question) => {
    setEdit(q);
    setForm({
      question: q.question,
      options: [...(q.options || []), '', '', '', ''].slice(0, 4),
      answer: q.answer ?? 0, marks: q.marks, negativeMarks: q.negativeMarks,
      subject: q.subject || '', explanation: q.explanation || '',
    });
    setModal(true);
  };

  const saveQ = async () => {
    const body = {
      question: form.question,
      options: form.options,
      answer: form.answer,
      marks: Number(form.marks),
      negativeMarks: Number(form.negativeMarks),
      subject: form.subject,
      explanation: form.explanation,
    };
    const res = edit
      ? await api(`/api/questions/${edit.id}`, { method: 'PUT', body: JSON.stringify({ ...edit, ...body }) })
      : await api('/api/questions', { method: 'POST', body: JSON.stringify(body) });
    if (res.ok) { setModal(false); onRefresh(); }
    else alert('Save failed');
  };

  const delQ = async (id: string) => {
    if (!confirm('Delete question?')) return;
    await api(`/api/questions/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const onOcrFile = async (file: File) => {
    setOcrBusy(true); setMsg(''); setOcrPreview([]);
    try {
      const reader = new FileReader();
      const b64: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await api('/api/ocr/parse', {
        method: 'POST',
        body: JSON.stringify({ fileBase64: b64, mimeType: file.type || 'image/jpeg' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'OCR failed');
      const list = Array.isArray(data) ? data : (data.questions || data.parsed || []);
      setOcrPreview(list);
      setMsg(`Parsed ${list.length} question(s)`);
    } catch (e: any) {
      setMsg(e.message || 'OCR failed');
    } finally {
      setOcrBusy(false);
    }
  };

  const importOcr = async () => {
    if (!ocrPreview.length) return;
    const res = await api('/api/questions/import-json', { method: 'POST', body: JSON.stringify({ questions: ocrPreview }) });
    if (res.ok) { setMsg('Imported to bank'); setOcrPreview([]); onRefresh(); }
    else setMsg('Import failed');
  };

  const importJson = async () => {
    try {
      const parsed = JSON.parse(jsonText);
      const list = Array.isArray(parsed) ? parsed : parsed.questions;
      const res = await api('/api/questions/import-json', { method: 'POST', body: JSON.stringify({ questions: list }) });
      if (res.ok) { setMsg('JSON imported'); setJsonText(''); onRefresh(); }
      else setMsg('Import failed');
    } catch {
      setMsg('Invalid JSON');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {(['bank', 'ocr', 'json'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSub(s)} className={`flex-1 py-2 rounded-lg text-xs font-semibold ${sub === s ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
            {s === 'bank' ? 'Bank' : s === 'ocr' ? 'Photo OCR' : 'JSON'}
          </button>
        ))}
      </div>

      {sub === 'bank' && (
        <>
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">Question bank ({questions.length})</h2>
            <button type="button" className={btnPrimary} onClick={openNew}>+ Add</button>
          </div>
          <div className="space-y-2">
            {questions.length === 0 && <p className="text-center text-sm text-slate-500 py-8">No questions yet</p>}
            {questions.map((qq, i) => (
              <div key={qq.id} className="bg-white border border-slate-200 rounded-2xl p-3">
                <div className="text-xs text-slate-400 mb-1">#{i + 1} {qq.subject || ''}</div>
                <div className="text-sm font-medium line-clamp-2">{qq.question}</div>
                <div className="flex gap-2 mt-2">
                  <button type="button" className={btnGhost} onClick={() => openEdit(qq)}>Edit</button>
                  <button type="button" className={btnDanger} onClick={() => delQ(qq.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {sub === 'ocr' && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold">Upload question photo</h2>
          <p className="text-sm text-slate-500">Gemini will extract MCQs from the image.</p>
          <input type="file" accept="image/*" capture="environment" disabled={ocrBusy}
            onChange={(e) => e.target.files?.[0] && onOcrFile(e.target.files[0])}
            className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-blue-600 file:text-white file:font-semibold"
          />
          {ocrBusy && <p className="text-sm text-blue-600">Parsing with Gemini…</p>}
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
          {ocrPreview.length > 0 && (
            <>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {ocrPreview.map((qq, i) => (
                  <div key={i} className="bg-white border rounded-xl p-3 text-sm">{qq.question || JSON.stringify(qq).slice(0, 120)}</div>
                ))}
              </div>
              <button type="button" className={btnPrimary + ' w-full'} onClick={importOcr}>Import to bank</button>
            </>
          )}
        </div>
      )}

      {sub === 'json' && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold">Import JSON</h2>
          <textarea className={inputCls + ' min-h-[160px] font-mono text-sm'} value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder='[{"question":"...","options":["A","B","C","D"],"answer":0,"marks":1}]' />
          {msg && <p className="text-sm">{msg}</p>}
          <button type="button" className={btnPrimary + ' w-full'} onClick={importJson}>Import</button>
        </div>
      )}

      {modal && (
        <Modal title={edit ? 'Edit question' : 'New question'} onClose={() => setModal(false)}>
          <div className="space-y-3">
            <Field label="Question"><textarea className={inputCls + ' min-h-[80px]'} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></Field>
            {['A', 'B', 'C', 'D'].map((letter, i) => (
              <Field key={letter} label={`Option ${letter}`}>
                <input className={inputCls} value={form.options[i]} onChange={(e) => {
                  const opts = [...form.options]; opts[i] = e.target.value; setForm({ ...form, options: opts });
                }} />
              </Field>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Correct">
                <select className={inputCls} value={form.answer} onChange={(e) => setForm({ ...form, answer: +e.target.value })}>
                  {[0, 1, 2, 3].map((i) => <option key={i} value={i}>{String.fromCharCode(65 + i)}</option>)}
                </select>
              </Field>
              <Field label="Marks"><input type="number" className={inputCls} value={form.marks} onChange={(e) => setForm({ ...form, marks: +e.target.value })} /></Field>
              <Field label="Negative"><input type="number" step="0.25" className={inputCls} value={form.negativeMarks} onChange={(e) => setForm({ ...form, negativeMarks: +e.target.value })} /></Field>
              <Field label="Subject"><input className={inputCls} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
            </div>
            <Field label="Explanation"><textarea className={inputCls} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} /></Field>
            <button type="button" className={btnPrimary + ' w-full'} onClick={saveQ}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ───────────── RESULTS ───────────── */
function ResultsTab({ exams, attempts, onRefresh }: { exams: Exam[]; attempts: Attempt[]; onRefresh: () => void }) {
  const [examId, setExamId] = useState('');
  const filtered = examId ? attempts.filter((a) => a.examId === examId) : attempts;
  const sorted = [...filtered].sort((a, b) => (a.rank || 999) - (b.rank || 999) || b.percentage - a.percentage);

  const recalc = async () => {
    if (!examId) return alert('Select an exam');
    await api(`/api/exams/${examId}/recalculate`, { method: 'POST' });
    onRefresh();
  };

  const exportCsv = () => {
    window.open(`${import.meta.env.VITE_API_URL || ''}/api/results/export?examId=${examId || ''}`, '_blank');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Results & Leaderboard</h2>
      <select className={inputCls} value={examId} onChange={(e) => setExamId(e.target.value)}>
        <option value="">All exams</option>
        {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
      </select>
      <div className="flex gap-2">
        <button type="button" className={btnGhost} onClick={recalc}>Recalculate</button>
        <button type="button" className={btnGhost} onClick={exportCsv}>Export CSV</button>
      </div>
      <div className="space-y-2">
        {sorted.length === 0 && <p className="text-center text-sm text-slate-500 py-8">No attempts yet</p>}
        {sorted.map((a) => (
          <div key={a.id} className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{a.rank ? `#${a.rank} ` : ''}{a.studentName}</div>
              <div className="text-xs text-slate-500">{a.studentClass} · {a.status}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-bold text-blue-600">{a.percentage}%</div>
              <div className="text-xs text-slate-500">{a.score}/{a.maxScore}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── SETTINGS ───────────── */
function SettingsTab({ settings, logs, onRefresh }: { settings: SystemSettings; logs: AuditLog[]; onRefresh: () => void }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(settings), [settings]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api('/api/settings', { method: 'PUT', body: JSON.stringify(form) });
      if (!res.ok) {
        const r2 = await api('/api/settings', { method: 'POST', body: JSON.stringify(form) });
        if (!r2.ok) throw new Error('Save failed');
      }
      onRefresh();
      alert('Settings saved');
    } catch (e: any) {
      alert(e.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const reseed = async () => {
    if (!confirm('Reset ALL data?')) return;
    await api('/api/reseed', { method: 'POST' });
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Settings</h2>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <Field label="Bot token"><input className={inputCls} value={form.telegramBotToken} onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })} /></Field>
        <Field label="Bot username"><input className={inputCls} value={form.botUsername} onChange={(e) => setForm({ ...form, botUsername: e.target.value })} /></Field>
        <Field label="Webhook URL"><input className={inputCls} value={form.webhookUrl} onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })} /></Field>
        <Field label="System notice"><textarea className={inputCls} value={form.systemNotice} onChange={(e) => setForm({ ...form, systemNotice: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.botActive} onChange={(e) => setForm({ ...form, botActive: e.target.checked })} /> Bot active</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.autoPublishResults} onChange={(e) => setForm({ ...form, autoPublishResults: e.target.checked })} /> Auto-publish results</label>
        <button type="button" className={btnPrimary + ' w-full'} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button>
      </div>
      <button type="button" className={btnDanger + ' border border-red-200 w-full'} onClick={reseed}>Reset all data</button>
      <div>
        <h3 className="font-semibold text-sm mb-2">Audit log</h3>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {logs.slice(0, 30).map((l) => (
            <div key={l.id} className="text-xs bg-white border border-slate-100 rounded-lg px-3 py-2">
              <span className="font-semibold">{l.action}</span> — {l.details}
              <div className="text-slate-400">{new Date(l.timestamp).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
