import React from 'react';
import {
  PlayCircle,
  RotateCcw
} from 'lucide-react';
import { Exam, ExamAttempt } from '../../types';

interface ExamsScreenProps {
  exams: Exam[];
  pastResults: ExamAttempt[];
  ongoingAttempt: ExamAttempt | null;
  onSelectExam: (exam: Exam) => void;
  onStartExamDirect: (exam: Exam, isPractice?: boolean) => void;
  onResumeOngoing: () => void;
}

export const ExamsScreen: React.FC<ExamsScreenProps> = ({
  exams,
  pastResults,
  ongoingAttempt,
  onSelectExam,
  onStartExamDirect,
  onResumeOngoing
}) => {
  // Split into active/assigned vs past exams
  const assignedExams = exams.filter(e => e.status !== 'past');
  const pastExams = exams.filter(e => e.status === 'past');

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
          Curriculum Assessments
        </span>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">
          Teacher Given Exams
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Select any assigned test to begin, or reattempt your past exams.
        </p>
      </div>

      {/* 1. ASSIGNED ACTIVE EXAMS SECTION */}
      {assignedExams.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Active Assigned Exams ({assignedExams.length})
            </h2>
          </div>

          <div className="space-y-3">
            {assignedExams.map(exam => (
              <div
                key={exam.id}
                className="glass-card rounded-3xl p-5 shadow-xs transition"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50/90 text-emerald-700 border border-emerald-200/80 backdrop-blur-md">
                    Live Assigned
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {exam.startTime || 'Available Anytime'}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 mt-2">
                  {exam.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {exam.subtitle}
                </p>

                {/* Compact Single-Row Meta Badge Ribbon */}
                <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                  <span className="px-3 py-1 rounded-xl glass-pill text-slate-700 font-semibold">
                    {exam.totalQuestions} Questions
                  </span>
                  <span className="px-3 py-1 rounded-xl glass-pill text-slate-700 font-semibold">
                    {exam.durationMinutes} mins
                  </span>
                  <span className="px-3 py-1 rounded-xl glass-pill text-slate-700 font-semibold font-mono">
                    +{exam.totalMarks} Marks
                  </span>
                </div>

                {/* Action Button */}
                <div className="mt-4 pt-3 border-t border-slate-200/40">
                  <button
                    onClick={() => onSelectExam(exam)}
                    className="w-full py-2.5 px-4 rounded-xl glass-btn-primary text-white font-bold text-xs shadow-xs transition text-center flex items-center justify-center gap-1.5"
                  >
                    <PlayCircle className="w-4 h-4" />
                    Start Exam
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. PAST & OLD EXAMS SECTION */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Past Exams Archive
            </h2>
            <p className="text-[11px] text-slate-400">
              Compact view for previously given exams.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-400 font-mono">
            {pastExams.length} Tests
          </span>
        </div>

        <div className="space-y-2.5">
          {pastExams.map(exam => {
            const attempt = pastResults.find(r => r.examId === exam.id);

            return (
              <div
                key={exam.id}
                className="glass-card-subtle rounded-2xl p-4 shadow-xs transition hover:bg-white/75"
              >
                {/* Header Line */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md glass-pill text-slate-600 shrink-0">
                      Past Exam
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {exam.title}
                    </h3>
                  </div>

                  {attempt && attempt.score !== undefined && (
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200/80 font-mono shrink-0">
                      Score: {attempt.score}/{attempt.maxScore}
                    </span>
                  )}
                </div>

                {/* Compact Info Row */}
                <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span>{exam.totalQuestions} Qs</span>
                    <span>•</span>
                    <span>{exam.durationMinutes}m</span>
                    <span>•</span>
                    <span className="font-mono">+{exam.totalMarks} pts</span>
                    {attempt && attempt.rank && (
                      <>
                        <span>•</span>
                        <span className="font-bold text-amber-600">Rank #{attempt.rank}</span>
                      </>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-400">
                    {exam.expiryDate ? `Concluded ${exam.expiryDate}` : 'Past Assessment'}
                  </span>
                </div>

                {/* Action Button: Reattempt Only */}
                <div className="mt-3 pt-2.5 border-t border-slate-200/40">
                  <button
                    onClick={() => onStartExamDirect(exam, false)}
                    className="w-full py-2 px-3 rounded-lg glass-btn-primary text-white font-bold text-xs shadow-2xs flex items-center justify-center gap-1.5 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reattempt
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
