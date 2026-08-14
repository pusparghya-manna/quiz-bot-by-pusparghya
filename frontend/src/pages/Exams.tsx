import React, { useState } from 'react';
import type { Exam, Question, ExamStatus } from '../types';
import { api } from '../api';
import { inp, btn, btnP, btnS, btnD, card } from '../styles/ui';
import { Field } from '../components/ui/Field';
import { Sheet } from '../components/ui/Sheet';
import { Badge } from '../components/ui/Badge';
import { toDatetimeLocalIST, fromDatetimeLocalIST, formatIST } from '../lib/time';
import { emptyQuestion } from '../lib/exam';
import { toast, toastSuccess, toastError, confirmAsync } from '../lib/notify';
import {
  IconPlus, IconTrash, IconEdit, IconCheck, IconUpload, IconShare, IconInfo,
  IconCalendar, IconCopy, IconFileText, IconSparkles, IconClose, IconSearch,
  IconChevronDown, IconClock, IconExam, IconUsers, IconBook
} from '../icons';

export function Exams({ exams, botUsername, onRefresh }: { exams: Exam[]; botUsername: string; onRefresh: () => void }) {
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
    // System share sheet (WhatsApp, Telegram, etc.) when the browser supports it
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Exam link — Quiz Bot by Pusparghya',
          text: 'Join this exam:',
          url: link,
        });
      }
    } catch {
      /* user cancelled system share — panel still available */
    }
    try {
      await navigator.clipboard.writeText(link);
      toastSuccess('Link ready below (also copied)');
    } catch {
      toast('Link ready below — use Copy or Share');
    }
  };

  const systemShare = async (link: string) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Exam link — Quiz Bot by Pusparghya',
          text: 'Join this exam:',
          url: link,
        });
        return;
      }
      toast('System share not supported on this device — use Copy link');
    } catch {
      /* cancelled */
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
    if (!form.title.trim()) return toastError('Title required');
    if (qs.length === 0) return toastError('Add at least one question');
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
      toastError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const delExam = async (id: string) => {
    if (!(await confirmAsync('Delete this exam?'))) return;
    await api(`/api/exams/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  const addManual = () => {
    const q = emptyQuestion();
    setEditQ(q);
    setQMode('manual');
  };

  const saveManualQ = () => {
    if (!editQ || !editQ.question.trim()) return toastError('Question text required');
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
      toastError('Invalid JSON');
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
      toastError(e.message || 'OCR failed');
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
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-blue-800">
              <IconShare className="w-3.5 h-3.5" /> Student exam link
            </div>
            <button type="button" className="text-[10px] font-bold text-slate-500 px-2 py-1 rounded-md hover:bg-white/80" onClick={() => setShareLink('')}>Close</button>
          </div>
          <div className="bg-white rounded-lg border border-blue-100 px-2.5 py-2 break-all text-blue-700 font-medium select-all">{shareLink}</div>
          <div className="flex gap-2">
            <button
              type="button"
              className={btnP + ' flex-1 !py-1.5 text-[11px]'}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareLink);
                  toastSuccess('Copied to clipboard');
                } catch {
                  toastError('Could not copy — select the link and copy manually');
                }
              }}
            >
              <IconCopy className="w-3.5 h-3.5" /> Copy link
            </button>
            <button
              type="button"
              className={btnS + ' flex-1 !py-1.5 text-[11px]'}
              onClick={() => systemShare(shareLink)}
            >
              <IconShare className="w-3.5 h-3.5" /> Share via apps
            </button>
          </div>
          <p className="text-[10px] text-blue-700/80 flex items-center gap-1"><IconInfo className="w-3 h-3 shrink-0" />Share this with students. Only this link starts the exam.</p>
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
