import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Grid2X2, Clock, AlertTriangle, RotateCcw,
  ChevronLeft, ChevronRight, X, Bookmark,
} from 'lucide-react';
import { Exam, ExamAttempt } from '../../types';
import { QuestionImage } from '../QuestionImage';
import { soundManager } from '../../utils/audio';
import { webappApi } from '../../api';

interface LiveExamScreenProps {
  exam: Exam;
  attempt: ExamAttempt;
  soundEnabled: boolean;
  onUpdateAttempt: (updated: ExamAttempt) => void;
  onOpenReview: () => void;
  onLeaveExam: () => void;
  onTimeUp: () => void;
}

export const LiveExamScreen: React.FC<LiveExamScreenProps> = ({
  exam,
  attempt,
  soundEnabled,
  onUpdateAttempt,
  onOpenReview,
  onLeaveExam,
  onTimeUp,
}) => {
  const questions = attempt.questions || exam.questions || [];
  const initialIdx = Math.min(
    attempt.currentQuestionIndex || 0,
    Math.max(0, questions.length - 1)
  );
  const [currentIdx, setCurrentIdx] = useState(initialIdx);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(attempt.secondsLeft);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeUpFired = useRef(false);

  const currentQ = questions[currentIdx];

  useEffect(() => {
    if (!currentQ) return;
    if (!attempt.visited[currentQ.id]) {
      onUpdateAttempt({
        ...attempt,
        visited: { ...attempt.visited, [currentQ.id]: true },
        currentQuestionIndex: currentIdx,
      });
    }
    webappApi.setIndex(attempt.id, currentIdx).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (!timeUpFired.current) {
            timeUpFired.current = true;
            onTimeUp();
          }
          return 0;
        }
        if (soundEnabled && (s - 1 === 300 || s - 1 === 60)) {
          soundManager.playWarning(true);
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [soundEnabled, onTimeUp]);

  const formatTimer = (secs: number) => {
    const m = Math.max(0, Math.floor(secs / 60));
    const s = Math.max(0, secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const isLowTime = secondsLeft <= 300;
  const isCriticalTime = secondsLeft <= 60;

  const getQuestionState = (idx: number) => {
    const q = questions[idx];
    if (!q) return 'not-visited';
    const hasAnswer = attempt.answers[q.id] !== undefined;
    const isMarked = !!attempt.marked[q.id];
    const isVisited = !!attempt.visited[q.id];
    if (hasAnswer && isMarked) return 'both';
    if (isMarked) return 'marked';
    if (hasAnswer) return 'answered';
    if (isVisited) return 'unanswered';
    return 'not-visited';
  };

  const persistAnswer = (questionId: string, optionIndex: number | null) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      webappApi.saveAnswer(attempt.id, questionId, optionIndex).catch(() => {});
    }, 200);
  };

  const handleSelectOption = (optIdx: number) => {
    if (!currentQ) return;
    soundManager.playSelect(soundEnabled);
    const next = { ...attempt.answers, [currentQ.id]: optIdx };
    onUpdateAttempt({ ...attempt, answers: next });
    persistAnswer(currentQ.id, optIdx);
  };

  const handleClearResponse = () => {
    if (!currentQ) return;
    soundManager.playClick(soundEnabled);
    const next = { ...attempt.answers };
    delete next[currentQ.id];
    onUpdateAttempt({ ...attempt, answers: next });
    persistAnswer(currentQ.id, null);
  };

  const toggleMark = () => {
    if (!currentQ) return;
    soundManager.playClick(soundEnabled);
    onUpdateAttempt({
      ...attempt,
      marked: { ...attempt.marked, [currentQ.id]: !attempt.marked[currentQ.id] },
    });
  };

  const handlePrevious = () => {
    soundManager.playClick(soundEnabled);
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  const handleNext = () => {
    soundManager.playClick(soundEnabled);
    if (currentIdx < questions.length - 1) setCurrentIdx(currentIdx + 1);
    else onOpenReview();
  };

  const answeredCount = Object.keys(attempt.answers).length;
  const markedCount = Object.values(attempt.marked).filter(Boolean).length;
  const unansweredCount = questions.length - answeredCount;
  const selected = currentQ ? attempt.answers[currentQ.id] : undefined;

  if (!currentQ) {
    return (
      <div className="p-8 text-center glass-card rounded-3xl">
        <p className="text-sm font-semibold text-slate-500">No questions loaded for this exam.</p>
        <button onClick={onLeaveExam} className="mt-4 px-4 py-2 rounded-xl glass-btn-secondary text-xs font-bold">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-36 md:pb-28 animate-in fade-in duration-300">
      <header className="sticky top-0 z-30 glass-header -mx-4 px-4 py-2.5 shadow-2xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowExitConfirm(true)} className="p-2 rounded-2xl glass-btn-secondary text-slate-700">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="hidden sm:block">
              <h2 className="text-xs font-bold text-slate-900 truncate max-w-[140px] md:max-w-[220px]">
                {exam.title || attempt.examTitle}
              </h2>
              <span className="text-[10px] text-slate-400">
                Question {currentIdx + 1} of {questions.length}
              </span>
            </div>
          </div>
          <div
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-mono font-bold text-xs md:text-sm ${
              isCriticalTime
                ? 'bg-rose-100/90 text-rose-700 border border-rose-300 animate-pulse'
                : isLowTime
                  ? 'bg-amber-100/90 text-amber-800 border border-amber-300'
                  : 'glass-pill text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{formatTimer(secondsLeft)}</span>
          </div>
          <button
            onClick={() => setIsPaletteOpen(true)}
            className="p-2 rounded-2xl glass-btn-secondary text-blue-600 text-xs font-bold flex items-center gap-1"
          >
            <Grid2X2 className="w-4 h-4" />
            <span className="text-[11px]">Palette</span>
          </button>
        </div>
        <div className="max-w-4xl mx-auto flex items-center justify-between pt-2 mt-1 border-t border-slate-200/40 text-xs">
          <div className="flex items-center gap-1.5">
            {currentQ.subject && (
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 font-bold text-[11px]">
                {currentQ.subject}
              </span>
            )}
          </div>
          <button
            onClick={toggleMark}
            className={`flex items-center gap-1 text-[11px] font-bold ${
              attempt.marked[currentQ.id] ? 'text-amber-600' : 'text-slate-400'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            {attempt.marked[currentQ.id] ? 'Marked' : 'Mark'}
          </button>
        </div>
      </header>

      <main className="max-w-4xl w-full mx-auto mt-4 space-y-4 flex-1">
        <div className="glass-card rounded-3xl p-5 md:p-6 shadow-xs relative">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Question {currentIdx + 1}
            </span>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-xl glass-pill text-slate-600">
              +{currentQ.marks || 1} / -{currentQ.negativeMarks || 0}
            </span>
          </div>

          <QuestionImage imageUrl={currentQ.imageUrl} imageFileId={currentQ.imageFileId} />

          <h1 className="font-semibold text-slate-900 leading-relaxed text-base md:text-lg">
            {currentQ.question}
          </h1>

          <div className="mt-6 space-y-3">
            {(currentQ.options || []).map((optionText, optIdx) => {
              const isSelected = selected === optIdx;
              return (
                <div
                  key={optIdx}
                  onClick={() => handleSelectOption(optIdx)}
                  className={`group relative flex items-start gap-3.5 p-3.5 md:p-4 rounded-2xl border transition cursor-pointer select-none ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/80 text-blue-950 ring-2 ring-blue-400/30'
                      : 'glass-panel text-slate-800 hover:bg-white/90'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isSelected
                        ? 'glass-btn-primary text-white'
                        : 'border border-slate-300/80 glass-pill text-slate-600'
                    }`}
                  >
                    {'ABCD'[optIdx] || optIdx + 1}
                  </div>
                  <div className="flex-1 text-sm md:text-base leading-relaxed self-center font-medium">
                    {optionText}
                  </div>
                </div>
              );
            })}
          </div>

          {selected !== undefined && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleClearResponse}
                className="text-xs font-semibold text-rose-600 hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear My Selection
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-30 glass-dock py-3 px-4 shadow-lg safe-bottom">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentIdx === 0}
            className="px-4 py-2.5 rounded-2xl glass-btn-secondary text-slate-700 disabled:opacity-40 font-bold text-xs md:text-sm flex items-center gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="px-6 py-2.5 rounded-2xl glass-btn-primary text-white font-bold text-xs md:text-sm flex items-center gap-1.5 ml-auto"
          >
            <span>{currentIdx === questions.length - 1 ? 'Review & Submit' : 'Save & Next'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>

      {isPaletteOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-md">
          <div className="glass-card rounded-t-3xl sm:rounded-3xl w-full max-w-xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/40">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Grid2X2 className="w-4 h-4 text-blue-600" />
                Question Palette
              </h3>
              <button onClick={() => setIsPaletteOpen(false)} className="p-1.5 rounded-xl glass-btn-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-3 gap-2 border-b border-slate-200/40 text-center">
              <div className="p-2.5 rounded-2xl glass-pill bg-emerald-50/70">
                <span className="text-[10px] uppercase font-bold text-emerald-700">Answered</span>
                <p className="text-base font-bold text-emerald-700 font-mono">{answeredCount}</p>
              </div>
              <div className="p-2.5 rounded-2xl glass-pill bg-amber-50/70">
                <span className="text-[10px] uppercase font-bold text-amber-700">Marked</span>
                <p className="text-base font-bold text-amber-700 font-mono">{markedCount}</p>
              </div>
              <div className="p-2.5 rounded-2xl glass-pill">
                <span className="text-[10px] uppercase font-bold text-slate-500">Unanswered</span>
                <p className="text-base font-bold text-slate-700 font-mono">{unansweredCount}</p>
              </div>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-5 gap-2.5">
                {questions.map((_, idx) => {
                  const state = getQuestionState(idx);
                  const isCurrent = idx === currentIdx;
                  let bgClass = 'glass-pill text-slate-700 font-medium';
                  if (state === 'answered') bgClass = 'bg-emerald-600 text-white font-bold';
                  else if (state === 'marked') bgClass = 'bg-amber-500 text-white font-bold';
                  else if (state === 'both') bgClass = 'bg-purple-600 text-white font-bold';
                  else if (state === 'unanswered') bgClass = 'bg-rose-50 border-2 border-rose-500 text-rose-600 font-bold';
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        soundManager.playClick(soundEnabled);
                        setCurrentIdx(idx);
                        setIsPaletteOpen(false);
                      }}
                      className={`h-10 rounded-2xl flex items-center justify-center font-mono text-sm ${bgClass} ${
                        isCurrent ? 'ring-3 ring-blue-500 ring-offset-2 scale-105' : ''
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="p-4 border-t border-slate-200/40">
              <button
                onClick={() => {
                  setIsPaletteOpen(false);
                  onOpenReview();
                }}
                className="w-full py-2.5 rounded-2xl glass-btn-primary text-white font-bold text-xs"
              >
                Go to Review & Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
          <div className="glass-card rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100/90 text-amber-700 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Leave active exam?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your answers are saved on the server. You can resume anytime from Home or Exams.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={() => setShowExitConfirm(false)} className="py-2.5 rounded-2xl glass-btn-secondary text-slate-700 font-bold text-xs">
                Keep Testing
              </button>
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  onLeaveExam();
                }}
                className="py-2.5 rounded-2xl bg-amber-600 text-white font-bold text-xs"
              >
                Save & Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
