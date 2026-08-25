import React, { useState } from 'react';
import {
  Trophy,
  Medal,
  Award,
  Clock,
  CheckCircle2,
  Calendar,
  Users,
  Target,
  Sparkles,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { ExamAttempt, Exam } from '../../types';
import { EXAM_LEADERBOARDS, LeaderboardEntry, MOCK_EXAMS } from '../../data/examsData';

interface LeaderboardScreenProps {
  pastResults: ExamAttempt[];
  exams?: Exam[];
  currentUserName: string;
  onSelectExamResult?: (attempt: ExamAttempt) => void;
}

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({
  pastResults,
  exams = MOCK_EXAMS,
  currentUserName,
  onSelectExamResult
}) => {
  // Determine list of past given exams
  // If pastResults is empty, fall back to past exams from exams list
  const availablePastExams = pastResults.length > 0
    ? pastResults
    : exams.filter(e => e.status === 'past').map(e => ({
        examId: e.id,
        examTitle: e.title,
        classLevel: e.classLevel,
        answers: [],
        marked: [],
        visited: [],
        eliminated: {},
        secondsLeft: 0,
        totalDurationSeconds: e.durationMinutes * 60,
        timeSpentSeconds: e.durationMinutes * 60,
        startedAt: new Date().toISOString(),
        isSubmitted: true,
        score: e.totalMarks * 0.85,
        maxScore: e.totalMarks,
        accuracy: 92,
        rank: 24,
        totalParticipants: 120
      }));

  // Selected Exam ID state (default to first past given exam)
  const [selectedExamId, setSelectedExamId] = useState<string>(
    availablePastExams[0]?.examId || 'science-challenge-03'
  );

  const selectedAttempt = availablePastExams.find(r => r.examId === selectedExamId) || availablePastExams[0];

  // Get leaderboard entries for selected exam
  const rawEntries: LeaderboardEntry[] = EXAM_LEADERBOARDS[selectedExamId] ||
    EXAM_LEADERBOARDS['science-challenge-03'] || [
      { rank: 1, name: 'Aarav Mukherjee', score: '80 / 80', accuracy: '100%', time: '18m 12s', badge: '🥇 1st' },
      { rank: 2, name: 'Tanvi Deshmukh', score: '76 / 80', accuracy: '95%', time: '21m 40s', badge: '🥈 2nd' },
      { rank: 3, name: 'Kunal Sen', score: '76 / 80', accuracy: '95%', time: '22m 15s', badge: '🥉 3rd' },
      { rank: 4, name: `${currentUserName} (You)`, score: `${selectedAttempt?.score || 68} / ${selectedAttempt?.maxScore || 80}`, accuracy: `${selectedAttempt?.accuracy || 92}%`, time: '23m 00s', badge: 'Top 10%', isUser: true }
    ];

  // Ensure user's name is dynamically set in leaderboard entries
  const entries: LeaderboardEntry[] = rawEntries.map(entry => {
    if (entry.isUser) {
      return {
        ...entry,
        name: `${currentUserName} (You)`
      };
    }
    return entry;
  });

  // Podium (Top 3)
  const top3 = entries.slice(0, 3);
  const restEntries = entries.slice(3);

  const userEntry = entries.find(e => e.isUser) || {
    rank: selectedAttempt?.rank || 24,
    score: `${selectedAttempt?.score || 68} / ${selectedAttempt?.maxScore || 80}`,
    accuracy: `${selectedAttempt?.accuracy || 94}%`,
    badge: 'Top 18%'
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
          Rankings & Standings
        </span>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">
          Exam Leaderboard
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Select any past given exam below to see the complete leaderboard and student rankings.
        </p>
      </div>

      {/* 1. ALL PAST GIVEN EXAMS SELECTOR CARDS */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
            All Past Given Exams ({availablePastExams.length})
          </label>
          <span className="text-[11px] text-blue-600 font-semibold">
            Tap an exam to view leaderboard
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {availablePastExams.map((attempt) => {
            const isSelected = attempt.examId === selectedExamId;
            const completedDate = attempt.completedAt
              ? new Date(attempt.completedAt).toLocaleDateString('en-US', {
                  day: 'numeric',
                  month: 'short'
                })
              : 'Completed';

            return (
              <div
                key={attempt.examId}
                onClick={() => setSelectedExamId(attempt.examId)}
                className={`p-3.5 transition cursor-pointer text-left ${
                  isSelected
                    ? 'glass-card-highlight border-blue-400/80 shadow-md ring-2 ring-blue-500/20'
                    : 'glass-card hover:scale-[1.01]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold truncate ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>
                    {attempt.examTitle}
                  </span>
                  {isSelected && (
                    <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-600 text-white shrink-0 shadow-2xs">
                      Active
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/40 text-[11px]">
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="font-bold text-slate-900 font-mono">
                      {attempt.score !== undefined ? `${attempt.score}/${attempt.maxScore}` : 'Scored'} pts
                    </span>
                    <span>•</span>
                    <span className="text-emerald-600 font-semibold font-mono">
                      {attempt.accuracy !== undefined ? `${attempt.accuracy}%` : '90%'} Acc
                    </span>
                  </div>

                  <span className="font-bold text-blue-600 font-mono">
                    Rank #{attempt.rank || 24}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. STUDENT'S PERSONAL PERFORMANCE HIGHLIGHT CARD */}
      {selectedAttempt && (
        <section className="glass-card rounded-3xl p-5 md:p-6 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                Leaderboard for Selected Exam
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">
                {selectedAttempt.examTitle}
              </h2>
            </div>
            <span className="px-3 py-1 text-xs font-bold rounded-full glass-btn-primary text-white shadow-xs">
              {userEntry.badge || `Rank #${userEntry.rank || selectedAttempt.rank || 24}`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center mt-3">
            <div className="p-3 rounded-2xl glass-pill bg-blue-50/60 border-blue-200/60">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Your Rank</span>
              <p className="text-base md:text-lg font-black text-blue-600 font-mono mt-0.5">
                #{userEntry.rank || selectedAttempt.rank || 24}
              </p>
            </div>

            <div className="p-3 rounded-2xl glass-pill">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Your Score</span>
              <p className="text-base md:text-lg font-black text-slate-900 font-mono mt-0.5">
                {selectedAttempt.score} <span className="text-xs text-slate-400 font-normal">/ {selectedAttempt.maxScore}</span>
              </p>
            </div>

            <div className="p-3 rounded-2xl glass-pill bg-emerald-50/60 border-emerald-200/60">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Accuracy</span>
              <p className="text-base md:text-lg font-black text-emerald-600 font-mono mt-0.5">
                {selectedAttempt.accuracy}%
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 3. TOP 3 PODIUM */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Top Rankers (Podium)
        </h2>

        <div className="grid grid-cols-3 gap-2 md:gap-3">
          {/* 2nd Place */}
          {top3[1] && (
            <div className="glass-card rounded-2xl p-3.5 text-center flex flex-col justify-between shadow-xs">
              <div>
                <span className="inline-block p-1.5 rounded-full glass-pill text-slate-600 text-sm mb-1">
                  🥈
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">2nd Place</span>
                <h3 className="text-xs font-bold text-slate-900 mt-0.5 truncate">
                  {top3[1].name}
                </h3>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-200/40">
                <p className="text-xs font-mono font-bold text-slate-800">
                  {top3[1].score}
                </p>
                <span className="text-[10px] text-emerald-600 font-mono font-semibold">
                  {top3[1].accuracy}
                </span>
              </div>
            </div>
          )}

          {/* 1st Place (Center & Highlighted) */}
          {top3[0] && (
            <div className="glass-card-highlight border-amber-300/80 bg-gradient-to-b from-amber-50/80 via-white/80 to-amber-50/40 p-3.5 text-center flex flex-col justify-between shadow-md -translate-y-1">
              <div>
                <span className="inline-block p-1.5 rounded-full bg-amber-100 text-amber-600 text-base mb-1 shadow-2xs">
                  🥇
                </span>
                <span className="text-[10px] font-black text-amber-700 uppercase block tracking-wider">
                  1st Rank
                </span>
                <h3 className="text-xs font-black text-slate-900 mt-0.5 truncate">
                  {top3[0].name}
                </h3>
              </div>
              <div className="mt-2.5 pt-2 border-t border-amber-200/60">
                <p className="text-xs font-mono font-black text-amber-700">
                  {top3[0].score}
                </p>
                <span className="text-[10px] text-emerald-600 font-mono font-bold">
                  {top3[0].accuracy} · {top3[0].time}
                </span>
              </div>
            </div>
          )}

          {/* 3rd Place */}
          {top3[2] && (
            <div className="glass-card rounded-2xl p-3.5 text-center flex flex-col justify-between shadow-xs">
              <div>
                <span className="inline-block p-1.5 rounded-full glass-pill text-amber-700 text-sm mb-1">
                  🥉
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">3rd Place</span>
                <h3 className="text-xs font-bold text-slate-900 mt-0.5 truncate">
                  {top3[2].name}
                </h3>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-200/40">
                <p className="text-xs font-mono font-bold text-slate-800">
                  {top3[2].score}
                </p>
                <span className="text-[10px] text-emerald-600 font-mono font-semibold">
                  {top3[2].accuracy}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 4. COMPLETE BATCH LEADERBOARD TABLE */}
      <section className="glass-card rounded-3xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Complete Scoreboard
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            {entries.length} Students Ranked
          </span>
        </div>

        <div className="divide-y divide-slate-100/80">
          {entries.map((entry) => {
            const isMe = entry.isUser;

            return (
              <div
                key={`${entry.rank}-${entry.name}`}
                className={`p-3.5 flex items-center justify-between gap-2 transition ${
                  isMe
                    ? 'bg-blue-50/70 border-l-4 border-blue-600 font-semibold'
                    : 'hover:bg-white/40'
                }`}
              >
                {/* Rank & Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                      entry.rank === 1
                        ? 'bg-amber-100 text-amber-700 shadow-2xs'
                        : entry.rank === 2
                        ? 'bg-slate-200 text-slate-700'
                        : entry.rank === 3
                        ? 'bg-amber-100/60 text-amber-800'
                        : isMe
                        ? 'glass-btn-primary text-white shadow-2xs'
                        : 'glass-pill text-slate-600'
                    }`}
                  >
                    {entry.rank}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p
                        className={`text-xs md:text-sm font-bold truncate ${
                          isMe ? 'text-blue-900' : 'text-slate-900'
                        }`}
                      >
                        {entry.name}
                      </p>
                      {entry.badge && (
                        <span className="px-2 py-0.5 text-[9px] font-bold rounded-full glass-pill text-slate-600 shrink-0">
                          {entry.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      Time: {entry.time}
                    </span>
                  </div>
                </div>

                {/* Score & Accuracy */}
                <div className="text-right shrink-0">
                  <p className="text-xs md:text-sm font-bold font-mono text-slate-900">
                    {entry.score}
                  </p>
                  <span className="text-[10px] text-emerald-600 font-mono font-semibold">
                    {entry.accuracy} Acc
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
