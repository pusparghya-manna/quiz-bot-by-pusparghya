import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Check,
  X,
} from 'lucide-react';
import { Question } from '../../types';
import { QuestionImage } from '../QuestionImage';

interface AnswersScreenProps {
  examTitle: string;
  questions: Question[];
  onBackToResults: () => void;
}

export const AnswersScreen: React.FC<AnswersScreenProps> = ({
  examTitle,
  questions,
  onBackToResults,
}) => {
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong' | 'skipped'>('all');

  const filtered = questions.filter((q) => {
    if (filter === 'correct') return q.status === 'correct';
    if (filter === 'wrong') return q.status === 'wrong';
    if (filter === 'skipped') return q.status === 'unattempted' || !q.status;
    return true;
  });

  const correctCount = questions.filter((q) => q.status === 'correct').length;
  const wrongCount = questions.filter((q) => q.status === 'wrong').length;
  const skippedCount = questions.filter(
    (q) => q.status === 'unattempted' || !q.status
  ).length;

  return (
    <div className="space-y-5 pb-12 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <button
          onClick={onBackToResults}
          className="p-2 rounded-2xl glass-btn-secondary text-slate-700 hover:text-slate-900 transition"
          aria-label="Back to results"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
            Verified Solutions
          </span>
          <h1 className="text-xl font-bold text-slate-900">Answer Review</h1>
          <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[240px]">{examTitle}</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilter('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${
            filter === 'all'
              ? 'glass-btn-primary text-white shadow-xs'
              : 'glass-btn-secondary text-slate-600'
          }`}
        >
          All ({questions.length})
        </button>
        <button
          onClick={() => setFilter('correct')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
            filter === 'correct'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'glass-pill text-emerald-700'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Correct ({correctCount})
        </button>
        <button
          onClick={() => setFilter('wrong')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
            filter === 'wrong'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'glass-pill text-rose-700'
          }`}
        >
          <XCircle className="w-3.5 h-3.5" />
          Incorrect ({wrongCount})
        </button>
        <button
          onClick={() => setFilter('skipped')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
            filter === 'skipped'
              ? 'bg-slate-700 text-white shadow-xs'
              : 'glass-pill text-slate-600'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Skipped ({skippedCount})
        </button>
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="p-8 text-center glass-card rounded-3xl">
            <p className="text-sm font-semibold text-slate-500">
              No questions match this filter.
            </p>
          </div>
        ) : (
          filtered.map((q, idx) => {
            const isSkipped =
              q.status === 'unattempted' ||
              q.selectedIndex === null ||
              q.selectedIndex === undefined;
            const isCorrect = q.status === 'correct';
            const userAns = q.selectedIndex;
            const correctAns = q.correctIndex;

            return (
              <article
                key={q.id || idx}
                className="glass-card rounded-3xl p-5 md:p-6 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                      Q{idx + 1}
                      {q.subject ? ` · ${q.subject}` : ''}
                    </span>
                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-xl glass-pill text-slate-600">
                      +{q.marks ?? 1}
                      {(q.negativeMarks ?? 0) > 0 ? ` / -${q.negativeMarks}` : ''}
                    </span>
                  </div>
                  {isSkipped ? (
                    <span className="px-2.5 py-0.5 rounded-full glass-pill text-slate-600 text-xs font-bold">
                      Not Attempted
                    </span>
                  ) : isCorrect ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Correct
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1">
                      <X className="w-3 h-3" /> Incorrect
                    </span>
                  )}
                </div>

                <QuestionImage imageUrl={q.imageUrl} imageFileId={q.imageFileId} />

                <h2 className="font-semibold text-slate-900 text-sm md:text-base leading-relaxed">
                  {q.question}
                </h2>

                <div
                  className={`p-3.5 rounded-2xl border text-xs md:text-sm font-medium ${
                    isSkipped
                      ? 'border-slate-200/60 glass-panel text-slate-500'
                      : isCorrect
                        ? 'border-emerald-300 bg-emerald-50/70 text-emerald-950'
                        : 'border-rose-300 bg-rose-50/70 text-rose-950'
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                    Your Answer
                  </span>
                  <p className="font-semibold">
                    {isSkipped || userAns === null || userAns === undefined ? (
                      'Skipped / Not answered'
                    ) : (
                      <>
                        <span className="font-bold mr-1">{'ABCD'[userAns]}.</span>
                        {q.options?.[userAns] ?? ''}
                      </>
                    )}
                  </p>
                </div>

                {correctAns !== null && correctAns !== undefined && (
                  <div className="p-3.5 rounded-2xl border border-emerald-300/80 bg-emerald-50/50 text-xs md:text-sm">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block mb-0.5">
                      Correct Answer
                    </span>
                    <p className="font-bold text-emerald-950">
                      <span className="mr-1">{'ABCD'[correctAns]}.</span>
                      {q.options?.[correctAns] ?? ''}
                    </p>
                  </div>
                )}

                {q.explanation ? (
                  <div className="p-4 rounded-2xl glass-card-subtle text-xs md:text-sm space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block">
                      Explanation
                    </span>
                    <p className="text-slate-700 leading-relaxed">{q.explanation}</p>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      <div className="pt-2">
        <button
          onClick={onBackToResults}
          className="w-full py-3.5 rounded-2xl glass-btn-secondary text-slate-700 font-bold text-xs transition"
        >
          Back to Score & Analytics
        </button>
      </div>
    </div>
  );
};
