import React from 'react';
import {
  Clock,
  ChevronRight,
  BookOpen,
  ListCheck,
  PlayCircle
} from 'lucide-react';
import { Exam, ExamAttempt, UserProfile } from '../../types';

interface HomeScreenProps {
  profile: UserProfile;
  ongoingAttempt: ExamAttempt | null;
  availableExams: Exam[];
  onNavigate: (tab: string) => void;
  onSelectExam: (exam: Exam) => void;
  onResumeOngoing: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  profile,
  ongoingAttempt,
  availableExams,
  onNavigate,
  onSelectExam,
  onResumeOngoing
}) => {
  const ongoingQuestionsVisited = ongoingAttempt
    ? ongoingAttempt.visited.filter(Boolean).length
    : 0;
  const ongoingTotal = ongoingAttempt ? ongoingAttempt.answers.length : 20;
  const ongoingMinutesLeft = ongoingAttempt
    ? Math.floor(ongoingAttempt.secondsLeft / 60)
    : 21;
  const ongoingProgressPct = ongoingAttempt
    ? Math.round((ongoingQuestionsVisited / ongoingTotal) * 100)
    : 35;

  const featuredExam = availableExams.find(e => e.id === 'apex-01') || availableExams[0];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Student Welcome Header Card */}
      <div className="glass-card rounded-3xl p-5 md:p-6 shadow-xs relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl glass-btn-primary text-white font-black text-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
            {profile.name.split(' ').map(n => n[0]).join('').slice(0, 2) || 'RS'}
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
              Welcome back
            </span>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight">
              {profile.name}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              {profile.classLevel} · {profile.track}
            </p>
          </div>
        </div>
      </div>

      {/* Ongoing Exam Banner (If active) */}
      {ongoingAttempt && !ongoingAttempt.isSubmitted && (
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
              Continue your exam
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-50/80 text-amber-800 border border-amber-200/80 backdrop-blur-md">
              Ongoing
            </span>
          </div>

          <div className="glass-card rounded-3xl p-5 shadow-xs relative overflow-hidden border-amber-200/60">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {ongoingAttempt.examTitle}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {ongoingQuestionsVisited} of {ongoingTotal} questions visited · {ongoingMinutesLeft} minutes left
                </p>
              </div>
              <div className="p-2.5 rounded-2xl glass-panel text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                <span>Attempt Progress</span>
                <span className="font-mono font-bold text-amber-600">{ongoingProgressPct}%</span>
              </div>
              <div className="h-2.5 w-full bg-slate-200/60 rounded-full overflow-hidden p-0.5 glass-panel">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-300 shadow-xs"
                  style={{ width: `${ongoingProgressPct}%` }}
                />
              </div>
            </div>

            <button
              onClick={onResumeOngoing}
              className="mt-4 w-full py-3 px-4 rounded-2xl glass-btn-primary active:scale-[0.99] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition"
            >
              <PlayCircle className="w-4 h-4" />
              Resume Exam
            </button>
          </div>
        </section>
      )}

      {/* Featured Assessment Section */}
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-base md:text-lg font-bold text-slate-900">
            Available exams
          </h2>
          <button
            onClick={() => onNavigate('exams')}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
          >
            View all
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {featuredExam && (
          <div className="glass-card rounded-3xl p-5 shadow-xs transition">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-50/90 text-emerald-700 border border-emerald-200/80 backdrop-blur-md">
                Available now
              </span>
              <span className="text-xs font-semibold text-slate-400">Live Mock</span>
            </div>

            <h3 className="text-lg font-bold text-slate-900 mt-2.5">
              {featuredExam.title}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {featuredExam.subtitle}
            </p>

            {/* Compact Meta Chips */}
            <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
              <span className="px-3 py-1 rounded-xl glass-pill text-slate-700 font-semibold">
                {featuredExam.totalQuestions} Questions
              </span>
              <span className="px-3 py-1 rounded-xl glass-pill text-slate-700 font-semibold">
                {featuredExam.durationMinutes} mins
              </span>
              <span className="px-3 py-1 rounded-xl glass-pill text-slate-700 font-semibold font-mono">
                +{featuredExam.totalMarks} Marks
              </span>
            </div>

            <button
              onClick={() => onSelectExam(featuredExam)}
              className="mt-4 w-full py-2.5 px-4 rounded-xl glass-btn-primary text-white font-bold text-xs shadow-xs transition"
            >
              Start Exam
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
