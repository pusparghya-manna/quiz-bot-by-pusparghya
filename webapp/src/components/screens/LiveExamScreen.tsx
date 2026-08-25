import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Grid2X2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2
} from 'lucide-react';
import { Exam, ExamAttempt, Question } from '../../types';
import { DiagramRenderer } from '../DiagramRenderer';
import { soundManager } from '../../utils/audio';

interface LiveExamScreenProps {
  exam: Exam;
  attempt: ExamAttempt;
  soundEnabled: boolean;
  onUpdateAttempt: (updated: ExamAttempt) => void;
  onOpenReview: () => void;
  onLeaveExam: () => void;
  onBookmarkQuestion: (q: Question) => void;
  isBookmarked: (qId: string) => boolean;
}

export const LiveExamScreen: React.FC<LiveExamScreenProps> = ({
  exam,
  attempt,
  soundEnabled,
  onUpdateAttempt,
  onOpenReview,
  onLeaveExam
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isDiagramExpanded, setIsDiagramExpanded] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const questions = exam.questions;
  const currentQ = questions[currentIdx] || questions[0];

  // Mark current question as visited on load/index change
  useEffect(() => {
    if (!attempt.visited[currentIdx]) {
      const newVisited = [...attempt.visited];
      newVisited[currentIdx] = true;
      onUpdateAttempt({
        ...attempt,
        visited: newVisited
      });
    }
  }, [currentIdx]);

  // Live Timer countdown tick
  useEffect(() => {
    const timer = setInterval(() => {
      if (attempt.secondsLeft > 0 && !attempt.isSubmitted) {
        const nextSeconds = attempt.secondsLeft - 1;
        const nextTimeSpent = (attempt.timeSpentSeconds || 0) + 1;

        // Warning alerts at 5 mins and 1 min
        if (soundEnabled && (nextSeconds === 300 || nextSeconds === 60)) {
          soundManager.playWarning(true);
        }

        onUpdateAttempt({
          ...attempt,
          secondsLeft: nextSeconds,
          timeSpentSeconds: nextTimeSpent
        });
      } else if (attempt.secondsLeft <= 0) {
        // Auto open review when timer runs out
        onOpenReview();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [attempt.secondsLeft, attempt.isSubmitted, soundEnabled]);

  // Format time remaining MM:SS
  const formatTimer = (secs: number) => {
    const m = Math.max(0, Math.floor(secs / 60));
    const s = Math.max(0, secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const isLowTime = attempt.secondsLeft <= 300; // < 5 mins
  const isCriticalTime = attempt.secondsLeft <= 60; // < 1 min

  // Question state badge computation
  const getQuestionState = (idx: number) => {
    const hasAnswer = attempt.answers[idx] !== null;
    const isMarked = attempt.marked[idx];
    const isVisited = attempt.visited[idx];

    if (hasAnswer && isMarked) return 'both'; // Purple
    if (isMarked) return 'marked'; // Orange
    if (hasAnswer) return 'answered'; // Green
    if (isVisited) return 'unanswered'; // Red
    return 'not-visited'; // Gray
  };

  // Option selection
  const handleSelectOption = (optIdx: number) => {
    soundManager.playSelect(soundEnabled);
    const newAnswers = [...attempt.answers];
    newAnswers[currentIdx] = optIdx;
    onUpdateAttempt({
      ...attempt,
      answers: newAnswers
    });
  };

  // Clear current response
  const handleClearResponse = () => {
    soundManager.playClick(soundEnabled);
    const newAnswers = [...attempt.answers];
    newAnswers[currentIdx] = null;
    onUpdateAttempt({
      ...attempt,
      answers: newAnswers
    });
  };

  // Navigate Previous / Next
  const handlePrevious = () => {
    soundManager.playClick(soundEnabled);
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
    }
  };

  const handleNext = () => {
    soundManager.playClick(soundEnabled);
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      onOpenReview();
    }
  };

  // Counts for Palette
  const answeredCount = attempt.answers.filter(a => a !== null).length;
  const markedCount = attempt.marked.filter(Boolean).length;
  const unansweredCount = questions.length - answeredCount;

  return (
    <div className="min-h-screen flex flex-col pb-36 md:pb-28 animate-in fade-in duration-300">
      {/* Sticky Exam Desk Header */}
      <header className="sticky top-0 z-30 glass-header -mx-4 px-4 py-2.5 shadow-2xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Back / Pause */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExitConfirm(true)}
              className="p-2 rounded-2xl glass-btn-secondary text-slate-700 hover:text-slate-900 transition"
              title="Pause / Leave Exam"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="hidden sm:block">
              <h2 className="text-xs font-bold text-slate-900 truncate max-w-[140px] md:max-w-[220px]">
                {exam.title}
              </h2>
              <span className="text-[10px] text-slate-400">
                Question {currentIdx + 1} of {questions.length}
              </span>
            </div>
          </div>

          {/* Center: Live Timer */}
          <div
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-mono font-bold text-xs md:text-sm transition backdrop-blur-md ${
              isCriticalTime
                ? 'bg-rose-100/90 text-rose-700 border border-rose-300 shadow-sm animate-pulse'
                : isLowTime
                ? 'bg-amber-100/90 text-amber-800 border border-amber-300 shadow-sm'
                : 'glass-pill text-slate-800 border-white/80 shadow-xs'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{formatTimer(attempt.secondsLeft)}</span>
          </div>

          {/* Quick Desk Tools: Question Palette */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsPaletteOpen(true)}
              className="p-2 rounded-2xl glass-btn-secondary text-blue-600 hover:text-blue-700 transition text-xs font-bold flex items-center gap-1"
              title="Question Palette"
            >
              <Grid2X2 className="w-4 h-4" />
              <span className="text-[11px]">Palette</span>
            </button>
          </div>
        </div>

        {/* Section chip sub-bar */}
        <div className="max-w-4xl mx-auto flex items-center justify-between pt-2 mt-1 border-t border-slate-200/40 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 font-bold text-[11px]">
              {currentQ.s}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              · {currentQ.type}
            </span>
          </div>
        </div>
      </header>

      {/* Main Question Workspace */}
      <main className="max-w-4xl w-full mx-auto mt-4 space-y-4 flex-1">
        <div className="glass-card rounded-3xl p-5 md:p-6 shadow-xs relative">
          {/* Question Meta Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                Question {currentIdx + 1}
              </span>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-xl glass-pill text-slate-600">
                +{currentQ.marks || 4} / -{currentQ.negativeMarks || 1}
              </span>
            </div>
          </div>

          {/* Interactive Diagram (If applicable) */}
          {currentQ.diagram && (
            <div className="relative">
              <DiagramRenderer
                type={currentQ.diagramType || 'prism'}
                title="Optical Prism Refraction Diagram"
                onCloseModal={() => setIsDiagramExpanded(true)}
              />
            </div>
          )}

          {/* Question Text */}
          <h1 className="font-semibold text-slate-900 leading-relaxed text-base md:text-lg">
            {currentQ.t}
          </h1>

          {/* Options Grid */}
          <div className="mt-6 space-y-3">
            {currentQ.o.map((optionText, optIdx) => {
              const isSelected = attempt.answers[currentIdx] === optIdx;

              return (
                <div
                  key={optIdx}
                  onClick={() => handleSelectOption(optIdx)}
                  className={`group relative flex items-start gap-3.5 p-3.5 md:p-4 rounded-2xl border transition cursor-pointer select-none ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/80 text-blue-950 ring-2 ring-blue-400/30 shadow-xs backdrop-blur-md'
                      : 'glass-panel text-slate-800 hover:bg-white/90 hover:border-white'
                  }`}
                >
                  {/* Option letter circle */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition ${
                      isSelected
                        ? 'glass-btn-primary text-white shadow-xs'
                        : 'border border-slate-300/80 glass-pill text-slate-600 group-hover:border-slate-400'
                    }`}
                  >
                    {'ABCD'[optIdx]}
                  </div>

                  {/* Option text */}
                  <div className="flex-1 text-sm md:text-base leading-relaxed self-center font-medium">
                    {optionText}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Option helpers: Clear response */}
          {attempt.answers[currentIdx] !== null && (
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

      {/* Fixed Bottom Action Toolbar */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 glass-dock py-3 px-4 shadow-lg safe-bottom">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentIdx === 0}
            className="px-4 py-2.5 rounded-2xl glass-btn-secondary text-slate-700 disabled:opacity-40 font-bold text-xs md:text-sm flex items-center gap-1.5 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="px-6 py-2.5 rounded-2xl glass-btn-primary active:scale-[0.98] text-white font-bold text-xs md:text-sm shadow-xs flex items-center gap-1.5 transition ml-auto"
          >
            <span>{currentIdx === questions.length - 1 ? 'Review & Submit' : 'Save & Next'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>

      {/* Question Palette Drawer Modal */}
      {isPaletteOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in">
          <div className="glass-card rounded-t-3xl sm:rounded-3xl w-full max-w-xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-white/90">
            {/* Drawer handle */}
            <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mt-3 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200/40 glass-header">
              <div className="flex items-center gap-2">
                <Grid2X2 className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Question Palette
                </h3>
              </div>
              <button
                onClick={() => setIsPaletteOpen(false)}
                className="p-1.5 rounded-xl glass-btn-secondary text-slate-700 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick status summary counts */}
            <div className="p-4 grid grid-cols-3 gap-2 border-b border-slate-200/40 text-center">
              <div className="p-2.5 rounded-2xl glass-pill bg-emerald-50/70 border-emerald-200/60">
                <span className="text-[10px] uppercase font-bold text-emerald-700">Answered</span>
                <p className="text-base font-bold text-emerald-700 font-mono">{answeredCount}</p>
              </div>
              <div className="p-2.5 rounded-2xl glass-pill bg-amber-50/70 border-amber-200/60">
                <span className="text-[10px] uppercase font-bold text-amber-700">Marked</span>
                <p className="text-base font-bold text-amber-700 font-mono">{markedCount}</p>
              </div>
              <div className="p-2.5 rounded-2xl glass-pill bg-slate-100/60">
                <span className="text-[10px] uppercase font-bold text-slate-500">Unanswered</span>
                <p className="text-base font-bold text-slate-700 font-mono">{unansweredCount}</p>
              </div>
            </div>

            {/* Palette Legend */}
            <div className="px-5 py-2.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 border-b border-slate-200/40">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-emerald-600"></span> Answered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-amber-500"></span> Marked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-purple-600"></span> Both
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-rose-500"></span> Visited
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md border border-slate-300 bg-white"></span> Not Visited
              </span>
            </div>

            {/* Question Grid */}
            <div className="p-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-5 gap-2.5">
                {questions.map((_, idx) => {
                  const state = getQuestionState(idx);
                  const isCurrent = idx === currentIdx;

                  let bgClass = 'glass-pill text-slate-700 font-medium';
                  if (state === 'answered') {
                    bgClass = 'bg-emerald-600 border-emerald-600 text-white font-bold shadow-xs';
                  } else if (state === 'marked') {
                    bgClass = 'bg-amber-500 border-amber-500 text-white font-bold shadow-xs';
                  } else if (state === 'both') {
                    bgClass = 'bg-purple-600 border-purple-600 text-white font-bold shadow-xs';
                  } else if (state === 'unanswered') {
                    bgClass = 'bg-rose-50 border-2 border-rose-500 text-rose-600 font-bold';
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        soundManager.playClick(soundEnabled);
                        setCurrentIdx(idx);
                        setIsPaletteOpen(false);
                      }}
                      className={`h-10 rounded-2xl flex items-center justify-center font-mono text-sm transition relative ${bgClass} ${
                        isCurrent ? 'ring-3 ring-blue-500 ring-offset-2 scale-105' : 'hover:scale-102'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200/40 glass-header flex gap-2">
              <button
                onClick={() => {
                  setIsPaletteOpen(false);
                  onOpenReview();
                }}
                className="w-full py-2.5 rounded-2xl glass-btn-primary text-white font-bold text-xs transition"
              >
                Go to Review & Submit Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Diagram Modal */}
      {isDiagramExpanded && (
        <DiagramRenderer
          type={currentQ.diagramType || 'prism'}
          isExpandedModal={true}
          onCloseModal={() => setIsDiagramExpanded(false)}
        />
      )}

      {/* Pause / Exit Confirmation Dialog */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
          <div className="glass-card rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-3 animate-in zoom-in-95 border-white">
            <div className="w-10 h-10 rounded-2xl bg-amber-100/90 text-amber-700 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Leave active exam?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your current answers and time remaining are automatically saved. You can resume anytime from the Home or Exams tab.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="py-2.5 rounded-2xl glass-btn-secondary text-slate-700 font-bold text-xs"
              >
                Keep Testing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false);
                  onLeaveExam();
                }}
                className="py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs"
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
