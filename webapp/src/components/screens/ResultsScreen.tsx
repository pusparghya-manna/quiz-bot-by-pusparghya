import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  TrendingUp,
  RotateCcw,
  BookOpen,
  ChevronRight,
  ArrowLeft,
  Trophy,
  BarChart2,
  Users,
  Check,
  Calendar
} from 'lucide-react';
import { Exam, ExamAttempt } from '../../types';
import { EXAM_LEADERBOARDS } from '../../data/examsData';

interface ResultsScreenProps {
  pastResults: ExamAttempt[];
  exams: Exam[];
  selectedAttempt: ExamAttempt | null;
  onSelectAttempt: (attempt: ExamAttempt | null) => void;
  onReviewAnswers: (attempt: ExamAttempt, exam: Exam) => void;
  onReattempt: (exam: Exam, isPractice?: boolean) => void;
  onGoExams: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  pastResults,
  exams,
  selectedAttempt,
  onSelectAttempt,
  onReviewAnswers,
  onReattempt,
  onGoExams
}) => {
  // If no attempt is selected, show the list of all previously taken exams in compact short cards
  if (!selectedAttempt) {
    return (
      <div className="space-y-6 pb-12 animate-in fade-in duration-300">
        {/* Header */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
            Assessment History
          </span>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">
            Your Exam Results ({pastResults.length})
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tap any completed exam to view full scorecard breakdown, leaderboard rank, and solution analysis.
          </p>
        </div>

        {/* Results List */}
        {pastResults.length === 0 ? (
          <div className="glass-card rounded-3xl p-8 text-center shadow-xs">
            <Trophy className="w-8 h-8 text-blue-400 mx-auto" />
            <h3 className="font-bold text-slate-900 text-base mt-2">
              No completed exams yet
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Complete an assigned exam from your teacher to view score analysis and ranks.
            </p>
            <button
              onClick={onGoExams}
              className="mt-4 px-4 py-2 rounded-2xl glass-btn-primary text-white font-bold text-xs shadow-xs"
            >
              Browse Assigned Exams
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {pastResults.map((attempt, idx) => {
              const matchedExam = exams.find(e => e.id === attempt.examId) || exams[0];
              const score = attempt.score !== undefined ? attempt.score : 68;
              const maxScore = attempt.maxScore !== undefined ? attempt.maxScore : 80;
              const accuracy = attempt.accuracy !== undefined ? attempt.accuracy : 90;
              const completedDate = attempt.completedAt
                ? new Date(attempt.completedAt).toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'short'
                  })
                : 'Completed';

              return (
                <div
                  key={`${attempt.examId}-${idx}`}
                  className="glass-card rounded-2xl p-4 shadow-xs transition hover:scale-[1.01]"
                >
                  {/* Card Header & Title */}
                  <div
                    onClick={() => onSelectAttempt(attempt)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Evaluated
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 truncate">
                          {attempt.examTitle}
                        </h3>
                      </div>

                      <span className="text-[11px] text-slate-400 font-medium shrink-0">
                        {completedDate}
                      </span>
                    </div>

                    {/* Compact Metrics Row */}
                    <div className="flex items-center justify-between mt-2.5 text-xs">
                      <div className="flex items-center gap-2 text-[11px] text-slate-600">
                        <span className="font-bold text-slate-900 font-mono">
                          {score} / {maxScore} pts
                        </span>
                        <span>•</span>
                        <span className="text-emerald-600 font-semibold font-mono">
                          {accuracy}% Acc
                        </span>
                        <span>•</span>
                        <span className="font-bold text-blue-600 font-mono">
                          Rank #{attempt.rank || 24}
                        </span>
                      </div>

                      <span className="text-[11px] font-bold text-blue-600 flex items-center gap-0.5">
                        Details <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>

                  {/* Compact Direct Actions: Solutions & Reattempt */}
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-200/40">
                    <button
                      onClick={() => onSelectAttempt(attempt)}
                      className="py-2 px-2.5 rounded-xl glass-btn-secondary text-blue-700 font-bold text-[11px] flex items-center justify-center gap-1.5 transition"
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      View Result
                    </button>

                    <button
                      onClick={() => onReattempt(matchedExam, false)}
                      className="py-2 px-2.5 rounded-xl glass-btn-primary text-white font-bold text-[11px] shadow-xs flex items-center justify-center gap-1.5 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reattempt
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // DETAILED VIEW FOR SELECTED ATTEMPT
  const matchedExam = exams.find(e => e.id === selectedAttempt.examId) || exams[0];
  const questions = matchedExam.questions;

  // Compute stats
  let correct = 0;
  let wrong = 0;
  let skipped = 0;

  selectedAttempt.answers.forEach((ans, idx) => {
    const q = questions[idx];
    if (!q) return;
    if (ans === null) {
      skipped++;
    } else if (ans === q.a) {
      correct++;
    } else {
      wrong++;
    }
  });

  const totalAttempted = correct + wrong;
  const accuracy = totalAttempted > 0 ? Math.round((correct / totalAttempted) * 100) : (selectedAttempt.accuracy || 0);
  const totalScore = selectedAttempt.score !== undefined ? selectedAttempt.score : (correct * 4 - wrong * 1);
  const maxScore = selectedAttempt.maxScore !== undefined ? selectedAttempt.maxScore : (questions.length * 4);
  const percentage = Math.round((correct / (questions.length || 1)) * 100);

  const timeUsedSeconds = selectedAttempt.timeSpentSeconds || (selectedAttempt.totalDurationSeconds - selectedAttempt.secondsLeft) || 1200;
  const timeUsedMinutes = Math.floor(timeUsedSeconds / 60);
  const timeUsedSecsRemainder = timeUsedSeconds % 60;
  const avgTimePerQ = totalAttempted > 0 ? Math.round(timeUsedSeconds / totalAttempted) : 45;

  // Section performance breakdown
  const subjectsMap: Record<string, { correct: number; total: number }> = {};
  questions.forEach((q, idx) => {
    if (!subjectsMap[q.s]) {
      subjectsMap[q.s] = { correct: 0, total: 0 };
    }
    subjectsMap[q.s].total++;
    if (selectedAttempt.answers[idx] === q.a) {
      subjectsMap[q.s].correct++;
    }
  });

  // Leaderboard benchmarks for this specific exam
  const leaderboardEntries = EXAM_LEADERBOARDS[selectedAttempt.examId] || EXAM_LEADERBOARDS['science-challenge-03'] || [];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Top back navigation button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onSelectAttempt(null)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl glass-btn-secondary text-slate-800 text-xs font-bold transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>All Results</span>
        </button>

        <span className="text-xs font-bold text-slate-400">
          {selectedAttempt.examTitle}
        </span>
      </div>

      {/* Main Score Card */}
      <div className="glass-card rounded-3xl p-6 md:p-8 shadow-xs text-center relative overflow-hidden">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">
          Your Recorded Score
        </span>

        <div className="mt-2 flex items-baseline justify-center gap-1.5 font-mono">
          <span className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
            {totalScore}
          </span>
          <span className="text-xl md:text-2xl font-bold text-slate-400">
            / {maxScore}
          </span>
        </div>

        <p className="text-xs font-semibold text-slate-500 mt-2 flex items-center justify-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-blue-500" />
          Time spent: {timeUsedMinutes}m {timeUsedSecsRemainder}s · Avg {avgTimePerQ}s / question
        </p>

        {/* 4 Core Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-6 text-left">
          <div className="p-3.5 rounded-2xl glass-pill bg-emerald-50/60 border-emerald-200/60">
            <span className="text-[10px] uppercase font-bold text-emerald-600 block">
              Correct
            </span>
            <span className="text-xl font-bold text-slate-900 mt-0.5 block font-mono">
              {correct} <span className="text-xs text-slate-400 font-normal">({percentage}%)</span>
            </span>
          </div>

          <div className="p-3.5 rounded-2xl glass-pill bg-rose-50/60 border-rose-200/60">
            <span className="text-[10px] uppercase font-bold text-rose-600 block">
              Incorrect
            </span>
            <span className="text-xl font-bold text-slate-900 mt-0.5 block font-mono">
              {wrong}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl glass-pill bg-slate-50/60">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Skipped
            </span>
            <span className="text-xl font-bold text-slate-900 mt-0.5 block font-mono">
              {skipped}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl glass-pill bg-blue-50/60 border-blue-200/60">
            <span className="text-[10px] uppercase font-bold text-blue-600 block">
              Accuracy
            </span>
            <span className="text-xl font-bold text-slate-900 mt-0.5 block font-mono">
              {accuracy}%
            </span>
          </div>
        </div>
      </div>

      {/* Section-wise Performance Breakdown */}
      {Object.keys(subjectsMap).length > 0 && (
        <div className="glass-card rounded-3xl p-5 md:p-6 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-blue-600" />
            Subject Breakdown
          </h3>

          <div className="space-y-3.5">
            {Object.entries(subjectsMap).map(([subject, stats]) => {
              const pct = Math.round((stats.correct / (stats.total || 1)) * 100);
              return (
                <div key={subject} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-800">{subject}</span>
                    <span className="font-mono text-slate-500">
                      {stats.correct} / {stats.total} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100/80 rounded-full overflow-hidden p-0.5 border border-slate-200/40">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-600' : 'bg-amber-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Peer Leaderboard for this Exam */}
      <div className="glass-card rounded-3xl p-5 md:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Exam Leaderboard & Rank
          </h3>
          <span className="px-3 py-0.5 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200/80">
            Rank #{selectedAttempt.rank || 24}
          </span>
        </div>

        <div className="space-y-2 mt-3">
          {leaderboardEntries.slice(0, 5).map((user, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between p-3 rounded-2xl text-xs transition ${
                user.isUser
                  ? 'glass-pill bg-blue-50/80 border-blue-300/80 text-blue-900 font-bold shadow-2xs'
                  : 'glass-panel text-slate-700 font-medium'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-slate-400 w-6 font-bold">#{user.rank}</span>
                <span>{user.name}</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                <span className="font-bold">{user.score}</span>
                <span className="text-[10px] text-slate-400">({user.accuracy})</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action CTA Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          onClick={() => onReviewAnswers(selectedAttempt, matchedExam)}
          className="py-3.5 px-3 rounded-2xl glass-btn-primary text-white font-bold text-xs md:text-sm shadow-xs flex items-center justify-center gap-1.5 transition"
        >
          <BookOpen className="w-4 h-4" />
          Review Solutions
        </button>

        <button
          onClick={() => onReattempt(matchedExam, false)}
          className="py-3.5 px-3 rounded-2xl glass-btn-secondary text-slate-800 font-bold text-xs md:text-sm flex items-center justify-center gap-1.5 transition"
        >
          <RotateCcw className="w-4 h-4" />
          Reattempt
        </button>
      </div>
    </div>
  );
};
