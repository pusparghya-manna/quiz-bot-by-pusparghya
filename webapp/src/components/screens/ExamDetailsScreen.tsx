import React, { useState } from 'react';
import { ArrowLeft, Clock, ListCheck, Award, AlertCircle, CheckCircle, ShieldCheck } from 'lucide-react';
import { Exam } from '../../types';

interface ExamDetailsScreenProps {
  exam: Exam;
  onBack: () => void;
  onConfirmStart: (exam: Exam) => void;
}

export const ExamDetailsScreen: React.FC<ExamDetailsScreenProps> = ({
  exam,
  onBack,
  onConfirmStart
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="space-y-5 pb-12 animate-in fade-in duration-300">
      {/* Top navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-2xl glass-btn-secondary text-slate-700 hover:text-slate-900 transition"
          aria-label="Back to exams"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
            Syllabus & Details
          </span>
          <h1 className="text-xl font-bold text-slate-900">
            Exam overview
          </h1>
        </div>
      </div>

      {/* Main Info Card */}
      <div className="glass-card rounded-3xl p-5 md:p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-50/90 text-blue-700 border border-blue-200/80 backdrop-blur-md">
            Official Mock Assessment
          </span>
          <span className="text-xs text-slate-400 font-semibold">{exam.classLevel}</span>
        </div>

        <h2 className="text-xl font-bold text-slate-900 mt-3">
          {exam.title}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {exam.subtitle}
        </p>

        {/* 4 Metric grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="p-3 rounded-2xl glass-pill">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Questions</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block font-mono">
              {exam.totalQuestions}
            </span>
          </div>

          <div className="p-3 rounded-2xl glass-pill">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Duration</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block font-mono">
              {exam.durationMinutes} Min
            </span>
          </div>

          <div className="p-3 rounded-2xl glass-pill">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Marks</span>
            <span className="text-base font-bold text-slate-900 mt-0.5 block font-mono">
              {exam.totalMarks} Pts
            </span>
          </div>

          <div className="p-3 rounded-2xl glass-pill">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Marking</span>
            <span className="text-base font-bold text-emerald-600 mt-0.5 block font-mono">
              +4 / -1
            </span>
          </div>
        </div>

        {/* Subject badges */}
        <div className="mt-4 pt-4 border-t border-slate-200/40 flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Included Subjects:</span>
          <div className="flex gap-1.5 flex-wrap">
            {exam.subjects.map(sub => (
              <span
                key={sub}
                className="px-2.5 py-0.5 rounded-xl glass-pill text-slate-700 text-xs font-semibold"
              >
                {sub}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Important Instructions Card */}
      <div className="glass-card-subtle rounded-3xl p-5 md:p-6 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          Important Instructions
        </h3>

        <ul className="mt-3.5 space-y-2.5 text-xs text-slate-600">
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
            <span>The countdown timer starts as soon as you confirm starting the exam.</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
            <span>Use the <strong>Question Palette</strong> to freely switch questions and check status.</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
            <span>You can <strong>Mark for Review</strong> any questions you wish to double check before final submission.</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
            <span>Integrated <strong>Scratchpad</strong> and <strong>Formula Sheet</strong> are available right on the exam desk.</span>
          </li>
        </ul>
      </div>

      {/* Start Action Stage */}
      {!showConfirm ? (
        <div className="glass-card rounded-3xl p-5 shadow-xs text-center space-y-3">
          <h3 className="text-base font-bold text-slate-900">
            Ready when you are
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Ensure you have an uninterrupted {exam.durationMinutes}-minute session before launching.
          </p>
          <button
            onClick={() => setShowConfirm(true)}
            className="w-full py-3.5 rounded-2xl glass-btn-primary text-white font-bold text-sm shadow-xs transition"
          >
            Start Exam
          </button>
        </div>
      ) : (
        <div className="glass-card rounded-3xl p-5 shadow-md space-y-3 animate-in zoom-in-95 duration-150 border-blue-400/60">
          <div className="flex items-center gap-2 text-blue-700">
            <AlertCircle className="w-5 h-5" />
            <h3 className="text-base font-bold text-slate-900">
              Start this timed exam now?
            </h3>
          </div>
          <p className="text-xs text-slate-600">
            The {exam.durationMinutes}-minute countdown will begin immediately.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={() => setShowConfirm(false)}
              className="py-3 rounded-2xl glass-btn-secondary text-slate-700 font-bold text-xs transition"
            >
              Not Yet
            </button>
            <button
              onClick={() => onConfirmStart(exam)}
              className="py-3 rounded-2xl glass-btn-primary text-white font-bold text-xs shadow-xs transition"
            >
              Yes, Begin Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
