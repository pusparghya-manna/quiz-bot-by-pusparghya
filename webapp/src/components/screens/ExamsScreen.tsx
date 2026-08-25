import React from 'react';
import { PlayCircle, RotateCcw, BookOpen } from 'lucide-react';
import { Exam, ExamAttempt, OngoingSummary } from '../../types';

interface ExamsScreenProps {
  exams: Exam[];
  pastResults: ExamAttempt[];
  ongoingAttempt: ExamAttempt | null;
  ongoingSummary: OngoingSummary | null;
  onSelectExam: (exam: Exam) => void;
  onStartExamDirect: (exam: Exam) => void;
  onResumeOngoing: () => void;
}

function isActive(status: string) {
  return status === 'LIVE' || status === 'SCHEDULED';
}

export const ExamsScreen: React.FC<ExamsScreenProps> = ({
  exams,
  pastResults,
  ongoingAttempt,
  ongoingSummary,
  onSelectExam,
  onStartExamDirect,
  onResumeOngoing,
}) => {
  const assignedExams = exams.filter((e) => isActive(e.status));
  const pastExams = exams.filter((e) => !isActive(e.status));
  const hasOngoing =
    (ongoingAttempt && !ongoingAttempt.isSubmitted) || !!ongoingSummary;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
          Curriculum Assessments
        </span>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Teacher Given Exams</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Select any assigned test to begin, or reattempt past exams.
        </p>
      </div>

      {hasOngoing && (
        <button
          onClick={onResumeOngoing}
          className="w-full glass-card rounded-2xl p-4 text-left border border-amber-200/60"
        >
          <span className="text-[10px] font-bold uppercase text-amber-700">Resume ongoing</span>
          <p className="font-bold text-slate-900 mt-0.5">
            {ongoingAttempt?.examTitle || ongoingSummary?.examTitle}
          </p>
        </button>
      )}

      {assignedExams.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Active Assigned Exams ({assignedExams.length})
          </h2>
          <div className="space-y-3">
            {assignedExams.map((exam) => (
              <div key={exam.id} className="glass-card rounded-3xl p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50/90 text-emerald-700 border border-emerald-200/80">
                    {exam.status === 'LIVE' ? 'Live' : 'Scheduled'}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {exam.subject || 'Exam'}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-2">{exam.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{exam.className || ''}</p>
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
                <div className="mt-4 pt-3 border-t border-slate-200/40">
                  <button
                    onClick={() => onSelectExam(exam)}
                    className="w-full py-2.5 px-4 rounded-xl glass-btn-primary text-white font-bold text-xs flex items-center justify-center gap-1.5"
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

      {assignedExams.length === 0 && pastExams.length === 0 && (
        <div className="glass-card rounded-3xl p-8 text-center">
          <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-900 mt-2">No exams yet</h3>
          <p className="text-xs text-slate-500 mt-1">
            Exams from your teacher will show up here automatically.
          </p>
        </div>
      )}

      {pastExams.length > 0 && (
        <section className="space-y-3 pt-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Past Exams Archive
          </h2>
          <div className="space-y-2.5">
            {pastExams.map((exam) => {
              const attempt = pastResults.find((r) => r.examId === exam.id);
              return (
                <div key={exam.id} className="glass-card-subtle rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{exam.title}</h3>
                    {attempt?.score !== undefined && (
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200/80 font-mono shrink-0">
                        {attempt.score}/{attempt.maxScore}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                    <span>
                      {exam.totalQuestions} Qs · {exam.durationMinutes}m · +{exam.totalMarks}
                    </span>
                    {attempt?.rank != null && (
                      <span className="font-bold text-amber-600">Rank #{attempt.rank}</span>
                    )}
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-slate-200/40">
                    <button
                      onClick={() => onStartExamDirect(exam)}
                      className="w-full py-2 px-3 rounded-lg glass-btn-primary text-white font-bold text-xs flex items-center justify-center gap-1.5"
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
      )}
    </div>
  );
};
