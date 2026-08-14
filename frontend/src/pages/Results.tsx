import React, { useState } from 'react';
import type { Exam, Attempt, Student } from '../types';
import { api } from '../api';
import { toast, toastSuccess, toastError, confirmAsync } from '../lib/notify';
import { inp, btnP, btnS, btnD, card } from '../styles/ui';
import { Sheet } from '../components/ui/Sheet';
import {
  IconCopy, IconDownload, IconArrowLeft, IconMessage, IconSend
} from '../icons';

export function Results({ exams, attempts, students, onRefresh }: { exams: Exam[]; attempts: Attempt[]; students: Student[]; onRefresh: () => void }) {
  type View = 'exams' | 'pick' | 'official' | 'practice';
  const [view, setView] = useState<View>('exams');
  const [examId, setExamId] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const [dmText, setDmText] = useState('');
  const [dmBusy, setDmBusy] = useState(false);

  const selectedExam = exams.find((e) => e.id === examId);

  const baseList = attempts.filter((a) => a.examId === examId && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'));
  const official = baseList
    .filter((a) => a.isOfficial !== false)
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.timeTakenSeconds - b.timeTakenSeconds));
  const practice = baseList
    .filter((a) => a.isOfficial === false)
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.timeTakenSeconds - b.timeTakenSeconds));

  const list = view === 'official' ? official : view === 'practice' ? practice : [];
  const visible = showAll ? list : list.slice(0, 10);

  const findStudent = (a: Attempt) =>
    students.find((s) => (s.telegramUserId && a.telegramUserId && s.telegramUserId === a.telegramUserId) || s.studentId === a.studentId);

  const openDetail = async (attemptId: string) => {
    const res = await api(`/api/attempts/${attemptId}/detail`);
    const data = await res.json();
    if (res.ok) { setDetail(data); setDmText(''); }
    else toastError(data.error || 'Failed');
  };

  const removeAttempt = async (id: string) => {
    if (!(await confirmAsync('Remove from results?'))) return;
    await api(`/api/attempts/${id}`, { method: 'DELETE' });
    setDetail(null);
    onRefresh();
  };

  const removeStudent = async (studentId: string) => {
    if (!(await confirmAsync('Delete student and all attempts?'))) return;
    await api(`/api/students/${studentId}`, { method: 'DELETE' });
    setDetail(null);
    onRefresh();
  };

  const copyText = async () => {
    const lines = list.map((a, i) => {
      const rank = a.rank || i + 1;
      const att = a.isOfficial === false && a.attemptNumber ? ` (attempt #${a.attemptNumber})` : '';
      return `${rank} - ${a.studentName}${att} - ${a.score}`;
    });
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess('Copied results text');
    } catch {
      toastError('Could not copy automatically');
    }
  };

  const exportCsv = async () => {
    const res = await api(`/api/results/export?examId=${examId || ''}&practice=${view === 'practice' ? '1' : '0'}`);
    if (!res.ok) {
      // fallback: build client-side CSV if server ignores practice flag
      const rows = ['Rank,Name,Telegram,Score,Max,Percentage,Attempt,Status,TimeSec'];
      list.forEach((a, i) => {
        const stu = findStudent(a);
        rows.push([a.rank || i + 1, a.studentName, stu?.telegramUsername || '', a.score, a.maxScore, a.percentage, a.attemptNumber || 1, a.status, a.timeTakenSeconds].map((x) => `"${x}"`).join(','));
      });
      const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const el = document.createElement('a');
      el.href = url;
      el.download = `${view}_${examId || 'exam'}.csv`;
      el.click();
      URL.revokeObjectURL(url);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${view}_${examId || 'exam'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendDm = async (telegramUserId: number) => {
    if (!dmText.trim()) return toastError('Enter a message');
    setDmBusy(true);
    try {
      const res = await api('/api/message', { method: 'POST', body: JSON.stringify({ telegramUserId, message: dmText.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Send failed');
      toastSuccess('Message sent via bot');
      setDmText('');
    } catch (e: any) {
      toastError(e.message || 'Failed');
    } finally {
      setDmBusy(false);
    }
  };

  // —— Main: exam list only ——
  if (view === 'exams') {
    return (
      <div className="space-y-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Results</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">Select an exam to view official or practice results</p>
        </div>
        {exams.length === 0 ? (
          <div className={card + ' p-8 text-center text-sm text-slate-500'}>No exams yet</div>
        ) : (
          <div className="space-y-1.5">
            {exams.map((e) => {
              const att = attempts.filter((a) => a.examId === e.id && (a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED'));
              const off = att.filter((a) => a.isOfficial !== false).length;
              const prac = att.filter((a) => a.isOfficial === false).length;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => { setExamId(e.id); setView('pick'); setShowAll(false); }}
                  className={card + ' p-3 w-full text-left hover:border-blue-300 transition'}
                >
                  <div className="font-semibold text-sm text-slate-900">{e.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {e.subject || '—'} · Official {off} · Practice {prac}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // —— Pick official vs practice ——
  if (view === 'pick') {
    return (
      <div className="space-y-3">
        <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 py-2 pr-3" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setView('exams'); }}>
          <IconArrowLeft className="w-4 h-4" /> All exams
        </button>
        <div>
          <h1 className="text-lg font-bold tracking-tight">{selectedExam?.title || 'Exam'}</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">Choose result type</p>
        </div>
        <button type="button" className={card + ' p-4 w-full text-left hover:border-blue-300'} onClick={() => { setView('official'); setShowAll(false); }}>
          <div className="font-semibold text-sm">📌 Official Exam Results</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{official.length} submission{official.length === 1 ? '' : 's'} · counts for leaderboard</div>
        </button>
        <button type="button" className={card + ' p-4 w-full text-left hover:border-blue-300'} onClick={() => { setView('practice'); setShowAll(false); }}>
          <div className="font-semibold text-sm">🔁 Practice Results</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{practice.length} attempt{practice.length === 1 ? '' : 's'} · with attempt number</div>
        </button>
      </div>
    );
  }

  // —— Official or practice list ——
  return (
    <div className="space-y-3">
      <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 py-2 pr-3" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setView('pick'); }}>
        <IconArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">{view === 'official' ? 'Official results' : 'Practice results'}</h1>
          <p className="text-[11px] text-slate-500">{selectedExam?.title} · Rank - Name - Marks</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className={btnS + ' flex-1 !py-1.5 text-[11px]'} onClick={copyText}><IconCopy className="w-3.5 h-3.5" /> Copy text</button>
        <button type="button" className={btnS + ' flex-1 !py-1.5 text-[11px]'} onClick={exportCsv}><IconDownload className="w-3.5 h-3.5" /> Export CSV</button>
      </div>
      <div className="space-y-1.5">
        {list.length === 0 && <div className={card + ' p-6 text-center text-sm text-slate-500'}>No results yet</div>}
        {visible.map((a, i) => {
          const stu = findStudent(a);
          const handle = stu?.telegramUsername;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => openDetail(a.id)}
              className={card + ' p-2.5 w-full text-left flex items-center gap-2 hover:border-blue-300'}
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold shrink-0">{a.rank || i + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm truncate text-blue-700">👤 {a.studentName}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {handle ? `💬 ${handle}` : '💬 No username'} · {a.score} marks
                  {view === 'practice' && a.attemptNumber ? ` · Attempt #${a.attemptNumber}` : ''}
                </div>
              </div>
              <div className="font-bold text-sm text-blue-600 shrink-0">{a.percentage}%</div>
            </button>
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
              <div>💬 {findStudent(detail.attempt)?.telegramUsername || 'No Telegram username'}</div>
              <div>🆔 {detail.attempt.studentId}</div>
              <div>📝 {detail.exam?.title}</div>
              {detail.attempt.isOfficial === false && (
                <div>🔁 Practice{detail.attempt.attemptNumber ? ` · Attempt #${detail.attempt.attemptNumber}` : ''}</div>
              )}
              <div>⭐ {detail.attempt.score}/{detail.attempt.maxScore} ({detail.attempt.percentage}%)</div>
              <div>⏱️ {Math.floor(detail.attempt.timeTakenSeconds / 60)}m {detail.attempt.timeTakenSeconds % 60}s</div>
            </div>

            {(detail.attempt.telegramUserId || findStudent(detail.attempt)?.telegramUserId) && (
              <div className={card + ' p-3 space-y-2'}>
                <div className="font-bold text-xs text-slate-600">Message student</div>
                {findStudent(detail.attempt)?.telegramUsername && (
                  <a
                    href={`https://t.me/${(findStudent(detail.attempt)!.telegramUsername || '').replace(/^@/, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className={btnS + ' w-full text-xs no-underline'}
                  >
                    <IconMessage className="w-3.5 h-3.5" /> Open in Telegram
                  </a>
                )}
                <textarea
                  className={inp + ' min-h-[72px] text-sm'}
                  value={dmText}
                  onChange={(e) => setDmText(e.target.value)}
                  placeholder="Type a message to send via bot…"
                />
                <button
                  type="button"
                  className={btnP + ' w-full text-xs'}
                  disabled={dmBusy}
                  onClick={() => sendDm(Number(detail.attempt.telegramUserId || findStudent(detail.attempt)?.telegramUserId))}
                >
                  {dmBusy ? 'Sending…' : 'Send by bot'}
                </button>
              </div>
            )}

            <div className="font-bold text-xs">Question-wise</div>
            <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
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
