import React from 'react';
import {
  FileSpreadsheet,
  Users,
  Award,
  BookOpen
} from 'lucide-react';
import { Exam, Attempt, Student } from '../types';

interface DashboardViewProps {
  stats?: any;
  exams?: Exam[];
  attempts?: Attempt[];
  students?: Student[];
  onNavigate?: (view: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  exams = [],
  attempts = [],
  students = [],
  onNavigate = (_view?: any) => {}
}) => {
  const activeExamsCount = exams.filter(e => e.status === 'LIVE' || e.status === 'SCHEDULED').length;
  const autoEnrolledStudentsCount = students.length;
  const completedAttempts = attempts.filter(a => a.status === 'SUBMITTED' || a.status === 'AUTO_SUBMITTED');
  let totalPctSum = 0;
  completedAttempts.forEach(a => { totalPctSum += a.percentage; });
  const avgPercentage = completedAttempts.length > 0 ? Math.round((totalPctSum / completedAttempts.length) * 10) / 10 : 0;

  const currentStats = stats || {
    activeExamsCount,
    totalExams: exams.length,
    autoEnrolledStudentsCount,
    totalSubmissions: completedAttempts.length,
    avgPercentage
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Metric Compact Box */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          
          {/* Active Exams */}
          <div className="p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Active & Scheduled</span>
              <div className="p-1 bg-blue-50 text-blue-600 rounded-md">
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1.5">
              <div className="text-xl font-extrabold text-slate-900 leading-none">{currentStats.activeExamsCount}</div>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Out of {currentStats.totalExams} total exams</p>
            </div>
          </div>

          {/* Telegram Students */}
          <div className="p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Auto-Enrolled Students</span>
              <div className="p-1 bg-emerald-50 text-emerald-600 rounded-md">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1.5">
              <div className="text-xl font-extrabold text-slate-900 leading-none">{currentStats.autoEnrolledStudentsCount}</div>
              <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                Registered via Telegram
              </p>
            </div>
          </div>

          {/* Total Submissions */}
          <div className="p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Exam Submissions</span>
              <div className="p-1 bg-indigo-50 text-indigo-600 rounded-md">
                <Award className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1.5">
              <div className="text-xl font-extrabold text-slate-900 leading-none">{currentStats.totalSubmissions}</div>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Auto-scored instantly</p>
            </div>
          </div>

          {/* Avg Performance */}
          <div className="p-3.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Avg Student Score</span>
              <div className="p-1 bg-amber-50 text-amber-600 rounded-md">
                <BookOpen className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="mt-1.5">
              <div className="text-xl font-extrabold text-slate-900 leading-none">{currentStats.avgPercentage}%</div>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Across all submissions</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
