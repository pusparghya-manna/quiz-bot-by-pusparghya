import React from 'react';
import { Clock, ChevronRight, PlayCircle, BookOpen } from 'lucide-react';
import { Exam, ExamAttempt, UserProfile, OngoingSummary } from '../../types';

interface HomeScreenProps {
  profile: UserProfile;
  ongoingAttempt: ExamAttempt | null;
  ongoingSummary: OngoingSummary | null;
  availableExams: Exam[];
  onNavigate: (tab: string) => void;
  onSelectExam: (exam: Exam) => void;
  onResumeOngoing: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  profile,
  ongoingAttempt,
  ongoingSummary,
  availableExams,
  onNavigate,
  onSelectExam,
  onResumeOngoing,
}) => {
  const hasOngoing =
    (ongoingAttempt && !ongoingAttempt.isSubmitted) || !!ongoingSummary;
  const ongoingTitle =
    ongoingAttempt?.examTitle || ongoingSummary?.examTitle || 'Exam in progress';
  const answered = ongoingAttempt
    ? Object.keys(ongoingAttempt.answers).length
    : ongoingSummary?.answeredCount || 0;
  const total =
    ongoingAttempt?.questions?.length || ongoingSummary?.totalQuestions || 0;
  const secondsLeft =
    ongoingAttempt?.secondsLeft ?? ongoingSummary?.secondsLeft ?? 0;
  const minutesLeft = Math.floor(secondsLeft / 60);
  const progressPct = total > 0 ? Math.round((answered / total) * 100) : 0;

  const liveExams = availableExams.filter(
    (e) => e.status === 'LIVE' || e.status === 'SCHEDULED'
  );
  const featuredExam = liveExams[0] || availableExams[0];

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="glass-card rounded-3xl p-5 md:p-6 shadow-xs relative overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl glass-btn-primary text-white font-black text-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
            {profile.name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase() || 'ST'}
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
              Welcome back
            </span>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight">
              {profile.name}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              {[profile.studentId, profile.classLevel, profile.telegramAccount]
                .filter(Boolean)
                .join(' · ') || 'Telegram student'}
            </p>
          </div>
        </div>
      </div>

      {hasOngoing && (
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
              Continue your exam
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-50/80 text-amber-800 border border-amber-200/80">
              Ongoing
            </span>
          </div>
          <div className="glass-card rounded-3xl p-5 shadow-xs border-amber-200/60">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">{ongoingTitle}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {answered} of {total || '?'} answered · {minutesLeft} min left
                </p>
              </div>
              <div className="p-2.5 rounded-2xl glass-panel text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                <span>Progress</span>
                <span className="font-mono font-bold text-amber-600">{progressPct}%</span>
              </div>
              <div className="h-2.5 w-full bg-slate-200/60 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <button
              onClick={onResumeOngoing}
              className="mt-4 w-full py-3 px-4 rounded-2xl glass-btn-primary text-white font-bold text-sm flex items-center justify-center gap-2"
            >
              <PlayCircle className="w-4 h-4" />
              Resume Exam
            </button>
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-base md:text-lg font-bold text-slate-900">Available exams</h2>
          <button
            onClick={() => onNavigate('exams')}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
          >
            View all
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {!featuredExam ? (
          <div className="glass-card rounded-3xl p-8 text-center">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-900 mt-2">No exams assigned yet</h3>
            <p className="text-xs text-slate-500 mt-1">
              When your teacher publishes an exam, it will appear here.
            </p>
          </div>
        ) : (
          <div className="glass-card rounded-3xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-50/90 text-emerald-700 border border-emerald-200/80">
                {featuredExam.status === 'LIVE' ? 'Live now' : featuredExam.status}
              </span>
              <span className="text-xs font-semibold text-slate-400">
                {featuredExam.subject || 'Exam'}
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-2.5">{featuredExam.title}</h3>
            <p className="text-xs text-slate-500 mt-1">{featuredExam.className || 'All classes'}</p>
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
              className="mt-4 w-full py-2.5 px-4 rounded-xl glass-btn-primary text-white font-bold text-xs"
            >
              View & Start
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
