import React, { useState } from 'react';
import { Award, Download, RefreshCw } from 'lucide-react';
import { Attempt, Exam } from '../types';

interface ResultsViewProps {
  attempts?: Attempt[];
  exams?: Exam[];
  onRefreshResults?: () => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  attempts = [],
  exams = [],
  onRefreshResults = () => {}
}) => {
  const [selectedExamId, setSelectedExamId] = useState<string>('ALL');

  const filteredAttempts = attempts.filter((att) => {
    if (selectedExamId !== 'ALL' && att.examId !== selectedExamId) return false;
    return true;
  });

  const handleRecalculateScores = async () => {
    if (selectedExamId === 'ALL') {
      alert('Please select a specific exam to recalculate scores.');
      return;
    }

    try {
      const res = await fetch(`/api/exams/${selectedExamId}/recalculate`, { method: 'POST' });
      if (res.ok) {
        alert('Scores and rankings recalculated successfully!');
        onRefreshResults();
      }
    } catch (err) {
      console.error('Recalculate error:', err);
    }
  };

  const handleExportCsv = () => {
    const url = `/api/results/export${selectedExamId !== 'ALL' ? `?examId=${selectedExamId}` : ''}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Award className="w-6 h-6 text-purple-600" />
            Examination Submissions & Results
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">
            Authoritative automated scoring, time breakdowns, score recalculation, and CSV exports
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleRecalculateScores}
            disabled={selectedExamId === 'ALL'}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
            <span>Recalculate Scores</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Bar Bento Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs shadow-2xs">
        <div className="flex items-center space-x-3">
          <span className="text-slate-600 font-bold">Select Examination:</span>
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-purple-500"
          >
            <option value="ALL">All Examinations</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} ({e.className})
              </option>
            ))}
          </select>
        </div>

        <div className="text-slate-500 text-[11px] font-semibold">
          Total Records: {filteredAttempts.length}
        </div>
      </div>

      {/* Results Table Bento Card */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3.5">Rank</th>
                <th className="px-4 py-3.5">Student Name</th>
                <th className="px-4 py-3.5">Student ID</th>
                <th className="px-4 py-3.5">Score & Pct</th>
                <th className="px-4 py-3.5">Breakdown (C / W / S)</th>
                <th className="px-4 py-3.5">Time Taken</th>
                <th className="px-4 py-3.5">Submission Type</th>
                <th className="px-4 py-3.5 text-right">Submitted At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAttempts.map((att) => {
                const mins = Math.floor(att.timeTakenSeconds / 60);
                const secs = att.timeTakenSeconds % 60;
                const timeStr = `${mins}m ${secs}s`;

                return (
                  <tr key={att.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      {att.rank ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-50 text-purple-700 font-mono text-[11px] font-bold border border-purple-200">
                          #{att.rank}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      {att.studentName}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-600 font-semibold">{att.studentId}</td>
                    <td className="px-4 py-3.5 font-bold text-emerald-700">
                      {att.score} / {att.maxScore} ({att.percentage}%)
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">
                      <span className="text-emerald-600 font-bold">{att.correctCount}</span> /{' '}
                      <span className="text-rose-600 font-bold">{att.wrongCount}</span> /{' '}
                      <span className="text-slate-400 font-medium">{att.skippedCount}</span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-600 font-semibold">{timeStr}</td>
                    <td className="px-4 py-3.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        att.status === 'AUTO_SUBMITTED'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        {att.status === 'AUTO_SUBMITTED' ? '⏰ Auto Expired' : '✅ Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right text-slate-500 font-medium text-[11px]">
                      {att.submittedAt ? new Date(att.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

