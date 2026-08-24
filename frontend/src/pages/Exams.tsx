import React, { useState } from 'react';
import type { Exam, Question, ExamStatus } from '../types';
import { api, getToken } from '../api';
import { inp, btn, btnP, btnS, btnD, card, inpIconWrap, inpBare, labelReq } from '../styles/ui';
import { Field } from '../components/ui/Field';
import { Sheet } from '../components/ui/Sheet';
import { ActionOverlay } from '../components/ui/ActionOverlay';
import { Badge } from '../components/ui/Badge';
import { toDatetimeLocalIST, fromDatetimeLocalIST, formatIST } from '../lib/time';
import { effectiveExamStatus } from '../lib/examStatus';
import { emptyQuestion, normalizeAnswer } from '../lib/exam';
import { prepareImageForOcr } from '../lib/image';
import { cropBBoxFromDataUrl, expandBBoxNorm1000, type BBox } from '../lib/bboxCrop';
import { DiagramCropEditor } from '../components/DiagramCropEditor';
import { toast, toastSuccess, toastError, confirmAsync } from '../lib/notify';
import {
  IconPlus, IconTrash, IconEdit, IconCheck, IconUpload, IconShare, IconInfo,
  IconCalendar, IconCopy, IconFileText, IconSparkles, IconClose, IconSearch,
  IconChevronDown, IconClock, IconExam, IconUsers, IconBook, IconHash,
  IconShuffle, IconMinus, IconBookmark, IconUser, IconEye, IconUpload
} from '../icons';

export function Exams({ exams, botUsername, onRefresh, defaultOpenNew = false }: { exams: Exam[]; botUsername: string; onRefresh: () => void; defaultOpenNew?: boolean }) {
  const [shareLink, setShareLink] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(!!defaultOpenNew);
  const [editId, setEditId] = useState<string | null>(null);
  const [step, setStep] = useState<'info' | 'questions' | 'review'>('info');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionLabel, setActionLabel] = useState('Working…');
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
  const [ocrPhase, setOcrPhase] = useState<'idle' | 'extract' | 'diagrams' | 'done'>('idle');
  const [ocrPageDataUrl, setOcrPageDataUrl] = useState<string | null>(null);
  const [ocrPageMime, setOcrPageMime] = useState('image/jpeg');
  const [imgBusy, setImgBusy] = useState(false);
  const [cropEditorOpen, setCropEditorOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
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
      toastSuccess('Link ready below — use Copy or Share');
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
      toastSuccess('System share not supported on this device — use Copy link');
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
    setQs(
      (exam.questions || []).map((q) => {
        const opts = [...(q.options || ['', '', '', ''])].slice(0, 4);
        const fileId = q.image?.fileId;
        return {
          ...q,
          options: opts,
          // Restore diagram preview after exam was saved (via media proxy)
          imagePreview: q.imagePreview || null,
        };
      })
    );
    setOcrPageDataUrl(null); // no original page after reload — expand/crop limited; Replace still works
    setStep('info');
    setQMode('list');
    setOpen(true);
  };

  const saveExam = async () => {
    if (!form.title.trim()) return toastError('Title required');
    if (qs.length === 0) return toastError('Add at least one question');
    setActionLabel(editId ? 'Saving exam…' : 'Creating exam…');
    setSaving(true);
    try {
      const questionsReady = await commitPendingCrops(qs);
      setQs(questionsReady);
      // Do not send local previews / draft bboxes to API
      const questionsForApi = questionsReady.map(({ imagePreview, image_bbox, ...rest }) => rest);
      const body = {
        title: form.title.trim(),
        subject: form.subject,
        className: form.className,
        testNumber: form.testNumber,
        startDate: form.startDate ? fromDatetimeLocalIST(form.startDate) : new Date().toISOString(),
        durationMinutes: Number(form.durationMinutes),
        negativeMarking: Number(form.negativeMarking),
        randomizeQuestions: form.randomizeQuestions,
        randomizeOptions: form.randomizeOptions,
        resultVisibility: 'PUBLISHED',
        leaderboardVisibility: 'PUBLISHED',
        questions: questionsForApi,
        totalQuestions: questionsForApi.length,
        totalMarks: questionsForApi.reduce((s, q) => s + (Number(q.marks) || 1), 0),
      };
      const res = editId
        ? await api(`/api/exams/${editId}`, { method: 'PUT', body: JSON.stringify(body), timeoutMs: 120_000 })
        : await api('/api/exams', { method: 'POST', body: JSON.stringify(body), timeoutMs: 120_000 });
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
    setActionLabel('Deleting exam…');
    setDeleting(true);
    try {
      const res = await api(`/api/exams/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Delete failed');
      }
      toastSuccess('Exam deleted');
      onRefresh();
    } catch (e: any) {
      toastError(e?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
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
        answer: normalizeAnswer(item.answer, 4),
        marks: item.marks ?? 1,
        negativeMarks: item.negativeMarks ?? 0,
        subject: item.subject || form.subject,
        explanation: item.explanation || '',
      }));
      setQs((prev) => [...prev, ...mapped.filter((q) => q.question)]);
      setJsonText('');
      setQMode('list');
      setToastMsg(`Added ${mapped.length} questions`);
      setTimeout(() => setToastMsg(''), 2000);
    } catch {
      toastError('Invalid JSON');
    }
  };

  const onOcr = async (file: File) => {
    setOcrBusy(true);
    setOcrPhase('extract');
    setToastMsg('');
    try {
      const prepared = await prepareImageForOcr(file);
      const pageDataUrl = `data:${prepared.mimeType};base64,${prepared.base64}`;
      setOcrPageDataUrl(pageDataUrl);
      setOcrPageMime(prepared.mimeType);
      setOcrPhase('diagrams');
      const res = await api('/api/ocr/parse', {
        method: 'POST',
        body: JSON.stringify({ fileBase64: prepared.base64, mimeType: prepared.mimeType }),
        timeoutMs: 180_000,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'OCR failed');
      const list: any[] = Array.isArray(data) ? data : data.questions || data.parsed || [];
      const mapped: Question[] = [];
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const bbox =
          item.image_bbox && item.has_image !== false ? (item.image_bbox as BBox) : null;
        let preview: string | null = null;
        if (bbox) {
          try {
            preview = await cropBBoxFromDataUrl(pageDataUrl, bbox);
          } catch {
            preview = null;
          }
        }
        mapped.push({
          id: `Q_OCR_${Date.now()}_${i}`,
          question: item.question || item.text || '',
          options: (item.options || ['', '', '', '']).slice(0, 4),
          answer: normalizeAnswer(
            item.answer ?? item.correctAnswer ?? item.correct_option ?? item.correctOption,
            4
          ),
          marks: item.marks ?? 1,
          negativeMarks: item.negativeMarks ?? 0,
          subject: item.subject || form.subject,
          explanation: item.explanation || '',
          image_bbox: bbox,
          imagePreview: preview,
          image: undefined,
        });
      }
      const validQuestions = mapped.filter((q) => q.question.trim());
      setQs((prev) => [...prev, ...validQuestions]);
      setQMode('list');
      setToastMsg(`OCR added ${validQuestions.length} questions — review diagrams, then save exam`);
      setTimeout(() => setToastMsg(''), 4000);
    } catch (e: any) {
      toastError(e.message || 'OCR failed');
    } finally {
      setOcrBusy(false);
      setOcrPhase('idle');
    }
  };

  const applyCropFromEditor = async (bbox: BBox) => {
    if (!editQ || !ocrPageDataUrl) return;
    setImgBusy(true);
    try {
      const preview = await cropBBoxFromDataUrl(ocrPageDataUrl, bbox);
      setEditQ({ ...editQ, image_bbox: bbox, imagePreview: preview, image: undefined });
      setCropEditorOpen(false);
    } catch (e: any) {
      toastError(e.message || 'Could not apply crop');
    } finally {
      setImgBusy(false);
    }
  };

  const expandDiagram = async (factor: number) => {
    if (!editQ?.image_bbox || !ocrPageDataUrl) {
      return toastError('No diagram on the original page to expand. Replace photo instead.');
    }
    setImgBusy(true);
    try {
      const next = expandBBoxNorm1000(editQ.image_bbox, factor);
      const preview = await cropBBoxFromDataUrl(ocrPageDataUrl, next);
      setEditQ({
        ...editQ,
        image_bbox: next,
        imagePreview: preview,
        image: undefined,
      });
    } catch (e: any) {
      toastError(e.message || 'Could not expand diagram');
    } finally {
      setImgBusy(false);
    }
  };

  const replaceQuestionPhoto = async (file: File) => {
    if (!editQ) return;
    setImgBusy(true);
    try {
      const b64: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const res = await api('/api/ocr/upload-image', {
        method: 'POST',
        body: JSON.stringify({ fileBase64: b64, mimeType: file.type || 'image/jpeg' }),
        timeoutMs: 60_000,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      const localPreview = `data:${file.type || 'image/jpeg'};base64,${b64}`;
      setEditQ({
        ...editQ,
        image: data.image,
        imagePreview: localPreview,
        image_bbox: null,
      });
      toastSuccess('New photo uploaded');
    } catch (e: any) {
      toastError(e.message || 'Photo upload failed');
    } finally {
      setImgBusy(false);
    }
  };

  const telegramMediaUrl = (fileId: string) => {
    const t = getToken();
    return `/api/media/telegram/${encodeURIComponent(fileId)}${t ? `?token=${encodeURIComponent(t)}` : ''}`;
  };

  const loadTelegramPreview = async (fileId: string): Promise<string | null> => {
    try {
      const res = await api(`/api/media/telegram/${encodeURIComponent(fileId)}`);
      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  };

  const openEditQuestion = (q: Question) => {
    const fileId = q.image?.fileId;
    const preview =
      q.imagePreview ||
      (fileId ? telegramMediaUrl(fileId) : null);
    setEditQ({
      ...q,
      options: [...(q.options || [])],
      imagePreview: preview,
    });
    setQMode('manual');
  };

  const commitPendingCrops = async (list: Question[]): Promise<Question[]> => {
    if (!ocrPageDataUrl) return list;
    const need = list.filter((q) => q.image_bbox && !q.image?.fileId);
    if (need.length === 0) return list;
    const base64 = ocrPageDataUrl.split(',')[1] || '';
    const res = await api('/api/ocr/commit-crops', {
      method: 'POST',
      body: JSON.stringify({
        fileBase64: base64,
        mimeType: ocrPageMime,
        items: need.map((q) => ({
          tempId: q.id,
          has_image: true,
          image_bbox: q.image_bbox,
        })),
      }),
      timeoutMs: 120_000,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save diagrams');
    const byId = new Map<string, any>();
    for (const it of data.items || []) byId.set(String(it.tempId), it);
    return list.map((q) => {
      const it = byId.get(q.id);
      if (!it?.image?.fileId) return q;
      return {
        ...q,
        image: {
          fileId: String(it.image.fileId),
          mimeType: it.image.mimeType,
          width: it.image.width,
          height: it.image.height,
        },
      };
    });
  };

  return (
    <>
    <ActionOverlay show={saving || deleting} label={actionLabel} />
    {cropEditorOpen && editQ?.image_bbox && ocrPageDataUrl ? (
      <DiagramCropEditor
        pageDataUrl={ocrPageDataUrl}
        initialBBox={editQ.image_bbox}
        onApply={(b) => void applyCropFromEditor(b)}
        onClose={() => setCropEditorOpen(false)}
      />
    ) : null}
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
                <div className="mt-1.5"><Badge s={effectiveExamStatus(exam)} /></div>
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
        <Sheet
          title={editId ? 'Edit exam' : 'New exam'}
          subtitle={editId ? 'Update exam details' : 'Create a new examination'}
          icon={<IconEdit className="w-4 h-4" />}
          onClose={() => setOpen(false)}
        >
          {/* Stepper — matches design, responsive */}
          <div className="mb-3">
            <div className="flex items-start justify-between gap-1 sm:gap-2 relative">
              <div className="absolute top-4 left-[12%] right-[12%] h-0.5 bg-slate-100 -z-0 hidden xs:block sm:block" aria-hidden />
              {([
                { id: 'info' as const, n: 1, label: 'Info', sub: 'Basic details' },
                { id: 'questions' as const, n: 2, label: 'Questions', sub: 'Add and manage' },
                { id: 'review' as const, n: 3, label: 'Review', sub: 'Preview exam' },
              ]).map((s) => {
                const active = step === s.id;
                const done =
                  (s.id === 'info' && (step === 'questions' || step === 'review')) ||
                  (s.id === 'questions' && step === 'review');
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStep(s.id)}
                    className="relative z-[1] flex-1 flex flex-col items-center text-center min-w-0"
                  >
                    <span
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold border-2 transition ${
                        active
                          ? 'bg-white border-blue-600 text-blue-600 shadow-sm shadow-blue-600/20'
                          : done
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-slate-200 text-slate-400'
                      }`}
                    >
                      {done && !active ? <IconCheck className="w-4 h-4" /> : s.n}
                    </span>
                    <span className={`mt-1 text-[10px] sm:text-[11px] font-bold truncate w-full ${active ? 'text-blue-600' : 'text-slate-600'}`}>
                      {s.label}
                    </span>
                    <span className="text-[9px] sm:text-[10px] text-slate-400 truncate w-full hidden sm:block">
                      {s.sub}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 h-0.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{
                  width: step === 'info' ? '33%' : step === 'questions' ? '66%' : '100%',
                }}
              />
            </div>
          </div>

          {step === 'info' && (
            <div className="space-y-2.5 sm:space-y-3">
              <div>
                <label className={labelReq}>
                  Exam title <span className="text-red-500">*</span>
                </label>
                <div className={inpIconWrap}>
                  <IconBookmark className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    className={inpBare}
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. Biology Unit Test 3"
                  />
                </div>
              </div>

              <div>
                <label className={labelReq}>
                  Subject <span className="text-red-500">*</span>
                </label>
                <div className={inpIconWrap}>
                  <IconBook className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    className={inpBare}
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="Biology"
                    list="exam-subjects"
                  />
                  <IconChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
                <datalist id="exam-subjects">
                  <option value="Biology" />
                  <option value="Physics" />
                  <option value="Chemistry" />
                  <option value="Mathematics" />
                  <option value="English" />
                  <option value="History" />
                  <option value="Geography" />
                  <option value="Computer Science" />
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className={labelReq}>
                    Class / group <span className="text-red-500">*</span>
                  </label>
                  <div className={inpIconWrap}>
                    <IconUser className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      className={inpBare}
                      value={form.className}
                      onChange={(e) => setForm({ ...form, className: e.target.value })}
                      placeholder="12"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelReq}>
                    Test code <span className="text-red-500">*</span>
                  </label>
                  <div className={inpIconWrap}>
                    <IconHash className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      className={inpBare}
                      value={form.testNumber}
                      onChange={(e) => setForm({ ...form, testNumber: e.target.value })}
                      placeholder="0A"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelReq}>
                  Start time <span className="text-red-500">*</span>
                </label>
                <div className={inpIconWrap}>
                  <IconCalendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="datetime-local"
                    className={inpBare + ' [color-scheme:light]'}
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div>
                  <label className={labelReq}>
                    Duration (minutes) <span className="text-red-500">*</span>
                  </label>
                  <div className={inpIconWrap}>
                    <IconClock className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="number"
                      min={1}
                      className={inpBare}
                      value={form.durationMinutes}
                      onChange={(e) => setForm({ ...form, durationMinutes: +e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelReq}>Negative marking</label>
                  <div className={inpIconWrap}>
                    <IconMinus className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      type="number"
                      step="0.25"
                      min={0}
                      className={inpBare}
                      value={form.negativeMarking}
                      onChange={(e) => setForm({ ...form, negativeMarking: +e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 pt-0.5">
                <label
                  className={`flex items-center gap-2 cursor-pointer rounded-lg border px-2.5 py-2 transition ${
                    form.randomizeQuestions
                      ? 'border-blue-400 bg-blue-50/70 ring-1 ring-blue-200'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.randomizeQuestions}
                    onChange={(e) => setForm({ ...form, randomizeQuestions: e.target.checked })}
                    className="w-3.5 h-3.5 accent-blue-600 rounded shrink-0"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1 text-[12px] font-bold text-slate-800">
                      <IconShuffle className="w-3 h-3 text-blue-600" />
                      Shuffle questions
                    </span>
                    <span className="block text-[9px] text-slate-500 leading-tight">
                      Random question order
                    </span>
                  </span>
                </label>
                <label
                  className={`flex items-center gap-2 cursor-pointer rounded-lg border px-2.5 py-2 transition ${
                    form.randomizeOptions
                      ? 'border-blue-400 bg-blue-50/70 ring-1 ring-blue-200'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.randomizeOptions}
                    onChange={(e) => setForm({ ...form, randomizeOptions: e.target.checked })}
                    className="w-3.5 h-3.5 accent-blue-600 rounded shrink-0"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1 text-[12px] font-bold text-slate-800">
                      <IconShuffle className="w-3 h-3 text-slate-500" />
                      Shuffle options
                    </span>
                    <span className="block text-[9px] text-slate-500 leading-tight">
                      Random option order
                    </span>
                  </span>
                </label>
              </div>

              <button
                type="button"
                className="w-full mt-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[13px] py-2.5 shadow-sm shadow-blue-600/20 active:scale-[0.99] transition"
                onClick={() => setStep('questions')}
              >
                Next: Questions →
              </button>
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

              {toastMsg && <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2"><IconCheck className="w-3.5 h-3.5 shrink-0" />{toastMsg}</div>}

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
                        <div className="text-[10px] text-slate-400 font-semibold mb-0.5">Q{i + 1} · Ans {q.answer == null ? 'Not provided' : String.fromCharCode(65 + q.answer)} · {q.marks} mark{(q.imagePreview || q.image?.fileId) ? ' · Diagram' : ''}</div>
                        <div className="flex gap-2 items-start">
                          {(q.imagePreview || q.image?.fileId) ? (
                            <img
                              src={q.imagePreview || (q.image?.fileId ? telegramMediaUrl(q.image.fileId) : '')}
                              alt={`Q${i + 1} diagram`}
                              className="w-16 h-16 object-contain rounded-md border border-slate-200 bg-slate-50 shrink-0"
                            />
                          ) : null}
                          <div className="text-[13px] font-medium text-slate-800 line-clamp-2 min-w-0 flex-1">{q.question}</div>
                        </div>
                        <div className="flex gap-1.5 mt-1.5">
                          <button type="button" className={btnS + ' !py-1 text-[11px]'} onClick={() => void openEditQuestion(q)}><IconEdit className="w-3 h-3" /> Edit</button>
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
                <div className="space-y-3">
                  {/* Diagram card — only when this question has / will have an image */}
                  {(editQ.imagePreview || editQ.image_bbox || editQ.image?.fileId) ? (
                    <div className="flex gap-2.5 items-start">
                      <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                        {editQ.imagePreview ? (
                          <img
                            src={editQ.imagePreview}
                            alt="Diagram"
                            className="w-full max-h-[160px] object-contain bg-white"
                          />
                        ) : (
                          <div className="h-28 flex items-center justify-center text-[11px] text-slate-400">No preview</div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 shrink-0 w-[88px]">
                        <button
                          type="button"
                          disabled={imgBusy || !editQ.image_bbox || !ocrPageDataUrl}
                          title={ocrPageDataUrl ? 'Expand crop' : 'Available right after Photo OCR'}
                          onClick={() => expandDiagram(1.12)}
                          className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-200 bg-white py-2 text-[9px] font-semibold text-slate-600 disabled:opacity-40"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                          Expand
                        </button>
                        <button
                          type="button"
                          disabled={imgBusy || !editQ.image_bbox || !ocrPageDataUrl}
                          title={ocrPageDataUrl ? 'Shrink crop' : 'Available right after Photo OCR'}
                          onClick={() => expandDiagram(0.9)}
                          className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-200 bg-white py-2 text-[9px] font-semibold text-slate-600 disabled:opacity-40"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" /></svg>
                          Shrink
                        </button>
                        <button
                          type="button"
                          disabled={!editQ.imagePreview}
                          onClick={() => {
                            if (editQ.imagePreview) window.open(editQ.imagePreview, '_blank', 'noopener,noreferrer');
                          }}
                          className="flex flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-200 bg-white py-2 text-[9px] font-semibold text-slate-600 disabled:opacity-40"
                        >
                          <IconEye className="w-4 h-4" />
                          Preview
                        </button>
                        <label className={"flex flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-200 bg-white py-2 text-[9px] font-semibold text-slate-600 cursor-pointer" + (imgBusy ? ' opacity-40 pointer-events-none' : '')}>
                          <IconUpload className="w-4 h-4" />
                          {imgBusy ? '…' : 'Replace'}
                          <input type="file" accept="image/*" className="hidden" disabled={imgBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void replaceQuestionPhoto(f); e.target.value = ''; }} />
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {editQ.image_bbox && ocrPageDataUrl ? (
                    <button type="button" className={btnS + ' !py-1 text-[11px] w-full'} disabled={imgBusy} onClick={() => setCropEditorOpen(true)}>
                      Edit crop (draw / resize)
                    </button>
                  ) : null}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-slate-600">Question</span>
                      <span className="text-[10px] text-slate-400">{(editQ.question || '').length}/500</span>
                    </div>
                    <textarea
                      className={inp + ' min-h-[52px] text-[13px]'}
                      maxLength={500}
                      value={editQ.question}
                      onChange={(e) => setEditQ({ ...editQ, question: e.target.value })}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold text-slate-600">Options</span>
                      <span className="text-[10px] text-slate-400">Select correct answer</span>
                    </div>
                    <div className="space-y-1.5">
                      {['A', 'B', 'C', 'D'].map((L, i) => (
                        <button
                          key={L}
                          type="button"
                          onClick={() => setEditQ({ ...editQ, answer: i })}
                          className={`w-full flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                            editQ.answer === i
                              ? 'border-emerald-300 bg-emerald-50/80'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <span className={`shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center ${
                            editQ.answer === i ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>{L}</span>
                          <input
                            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-slate-800 placeholder:text-slate-400"
                            value={editQ.options[i] || ''}
                            placeholder={`Option ${L}`}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const opts = [...editQ.options];
                              opts[i] = e.target.value;
                              setEditQ({ ...editQ, options: opts });
                            }}
                          />
                          <span className={`shrink-0 w-4 h-4 rounded-full border-2 ${
                            editQ.answer === i ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                          }`} />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-600 mb-1">Correct answer</div>
                      <select
                        className={inp + ' appearance-none text-[13px]'}
                        value={editQ.answer == null ? '' : editQ.answer}
                        onChange={(e) => setEditQ({ ...editQ, answer: e.target.value === '' ? null : Number(e.target.value) })}
                      >
                        <option value="">Not provided</option>
                        {[0, 1, 2, 3].map((i) => (
                          <option key={i} value={i}>{String.fromCharCode(65 + i)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-slate-600 mb-1">Marks</div>
                      <input type="number" className={inp + ' text-[13px]'} value={editQ.marks} onChange={(e) => setEditQ({ ...editQ, marks: +e.target.value })} />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button type="button" className={btnS + ' flex-1'} onClick={() => { setEditQ(null); setCropEditorOpen(false); setQMode('list'); }}>Cancel</button>
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
                    <div className="mx-auto w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500 mb-1.5">
                      {ocrBusy ? (
                        <span className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" aria-hidden />
                      ) : (
                        <IconSparkles className="w-5 h-5" />
                      )}
                    </div>
                    {ocrBusy ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-700">
                          {ocrPhase === 'extract' && 'Detecting question blocks on the page…'}
                          {ocrPhase === 'diagrams' && 'Extracting text and cropping diagram questions…'}
                          {ocrPhase !== 'extract' && ocrPhase !== 'diagrams' && 'Processing…'}
                        </p>
                        <div className="h-1.5 w-full max-w-[200px] mx-auto rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500 animate-pulse"
                            style={{ width: ocrPhase === 'extract' ? '45%' : ocrPhase === 'diagrams' ? '85%' : '60%' }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500">This can take up to a few minutes for diagram pages.</p>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600">Upload a photo of questions.</p>
                    )}
                  </div>
                  <label className={btnP + ' w-full cursor-pointer' + (ocrBusy ? ' opacity-70 pointer-events-none' : '')}>
                    <IconUpload className="w-4 h-4" />
                    {ocrBusy ? 'Working…' : 'Choose photo'}
                    <input type="file" accept="image/*" className="hidden" disabled={ocrBusy}
                      onChange={(e) => e.target.files?.[0] && onOcr(e.target.files[0])} />
                  </label>
                  <button type="button" className={btnS + ' w-full'} disabled={ocrBusy} onClick={() => setQMode('list')}>Back to list</button>
                </div>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-3">
              <div className={card + ' p-3.5 space-y-1 text-sm'}>
                <div className="font-bold text-base">{form.title || '(Untitled)'}</div>
                <div className="text-[12px] text-slate-500">{form.subject} · {form.className} · {form.durationMinutes} min</div>
                <div className="pt-1"><Badge s={effectiveExamStatus({ startDate: form.startDate ? fromDatetimeLocalIST(form.startDate) : new Date().toISOString(), durationMinutes: form.durationMinutes })} /></div>
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
              <p className="text-[11px] text-slate-500 flex items-center gap-1"><IconInfo className="w-3 h-3 shrink-0" />Status is automatic: Scheduled before start, Live during the window, Results published after it ends.</p>
              <div className="flex gap-2">
                <button type="button" className={btnS + ' flex-1'} onClick={() => setStep('questions')}>← Edit questions</button>
                <button type="button" className={btnP + ' flex-1 inline-flex items-center justify-center gap-2'} disabled={saving || deleting} onClick={saveExam}>
                  {saving ? (editId ? 'Saving…' : 'Creating…') : (editId ? 'Save exam' : 'Create exam')}</button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </div>
    </>
  );
}
