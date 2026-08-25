import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Bookmark,
  BookmarkCheck,
  Filter,
  Check,
  X
} from 'lucide-react';
import { Exam, ExamAttempt, Question } from '../../types';
import { DiagramRenderer } from '../DiagramRenderer';

interface AnswersScreenProps {
  exam: Exam;
  attempt: ExamAttempt;
  onBackToResults: () => void;
  onBookmarkQuestion?: (q: Question) => void;
  isBookmarked?: (qId: string) => boolean;
}

export const AnswersScreen: React.FC<AnswersScreenProps> = ({
  exam,
  attempt,
  onBackToResults
}) => {
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong' | 'skipped'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');

  const questions = exam.questions;

  const filteredQuestions = questions
    .map((q, idx) => ({
      q,
      idx,
      userAns: attempt.answers[idx],
      isCorrect: attempt.answers[idx] === q.a,
      isSkipped: attempt.answers[idx] === null
    }))
    .filter(item => {
      // Status filter
      if (filter === 'correct' && !item.isCorrect) return false;
      if (filter === 'wrong' && (item.isCorrect || item.isSkipped)) return false;
      if (filter === 'skipped' && !item.isSkipped) return false;

      // Subject filter
      if (subjectFilter !== 'All' && item.q.s !== subjectFilter) return false;

      return true;
    });

  const correctCount = attempt.answers.filter((ans, i) => ans === questions[i]?.a).length;
  const wrongCount = attempt.answers.filter((ans, i) => ans !== null && ans !== questions[i]?.a).length;
  const skippedCount = attempt.answers.filter(ans => ans === null).length;

  return (
    <div className="space-y-5 pb-12 animate-in fade-in duration-300">
      {/* Header */}
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
            Verified Solutions & Keys
          </span>
          <h1 className="text-xl font-bold text-slate-900">
            Answer Review
          </h1>
        </div>
      </div>

      {/* Status Filter Chips */}
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
              : 'glass-pill text-emerald-700 hover:bg-emerald-50/50'
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
              : 'glass-pill text-rose-700 hover:bg-rose-50/50'
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
              : 'glass-pill text-slate-600 hover:bg-slate-100/50'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Skipped ({skippedCount})
        </button>
      </div>

      {/* Solutions List */}
      <div className="space-y-4">
        {filteredQuestions.length === 0 ? (
          <div className="p-8 text-center glass-card rounded-3xl">
            <p className="text-sm font-semibold text-slate-500">No questions match the selected filter.</p>
          </div>
        ) : (
          filteredQuestions.map(({ q, idx, userAns, isCorrect, isSkipped }) => (
            <article
              key={q.id || idx}
              className="glass-card rounded-3xl p-5 md:p-6 shadow-xs space-y-4"
            >
              {/* Question metadata header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                    Q{idx + 1} · {q.s}
                  </span>
                  <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-xl glass-pill text-slate-600">
                    {q.type}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Status badge */}
                  {isSkipped ? (
                    <span className="px-2.5 py-0.5 rounded-full glass-pill text-slate-600 text-xs font-bold">
                      Not Attempted
                    </span>
                  ) : isCorrect ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Correct (+4)
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1">
                      <X className="w-3 h-3" /> Incorrect (-1)
                    </span>
                  )}
                </div>
              </div>

              {/* Diagram if applicable */}
              {q.diagram && (
                <DiagramRenderer
                  type={q.diagramType || 'prism'}
                  title="Optical Prism Refraction Diagram"
                />
              )}

              {/* Question Text */}
              <h2 className="font-semibold text-slate-900 text-sm md:text-base leading-relaxed">
                {q.t}
              </h2>

              {/* Your Answer Block */}
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
                  {userAns === null ? (
                    'Skipped / Not answered'
                  ) : (
                    <>
                      <span className="font-bold mr-1">{'ABCD'[userAns]}.</span> {q.o[userAns]}
                    </>
                  )}
                </p>
              </div>

              {/* Correct Answer Block */}
              <div className="p-3.5 rounded-2xl border border-emerald-300/80 bg-emerald-50/50 text-xs md:text-sm">
                <span className="text-[10px] uppercase font-bold text-emerald-700 block mb-0.5">
                  Correct Answer
                </span>
                <p className="font-bold text-emerald-950">
                  <span className="mr-1">{'ABCD'[q.a]}.</span> {q.o[q.a]}
                </p>
              </div>

              {/* Step-by-Step Explanation */}
              <div className="p-4 rounded-2xl glass-card-subtle text-xs md:text-sm space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block">
                  Detailed Explanation & Concept
                </span>
                <p className="text-slate-700 leading-relaxed">
                  {q.e}
                </p>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Back to top CTA */}
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
