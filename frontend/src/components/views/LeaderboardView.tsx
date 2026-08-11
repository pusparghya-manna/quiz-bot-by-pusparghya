import React, { useState } from 'react';
import { Trophy, Award, Search, Download, Medal, Flame, CheckCircle2 } from 'lucide-react';
import { Attempt, Exam } from '../types';

interface LeaderboardViewProps {
  attempts?: Attempt[];
  exams?: Exam[];
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  attempts = [],
  exams = []
}) => {
  const [selectedExamId, setSelectedExamId] = useState<string>(exams[0]?.id || 'ALL');

  const activeExam = exams.find(e => e.id === selectedExamId);

  const filteredAttempts = attempts
    .filter(a => selectedExamId === 'ALL' || a.examId === selectedExamId)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTakenSeconds - b.timeTakenSeconds; // lower time wins tie
    })
    .map((att, index) => ({ ...att, rank: index + 1 }));

  const topThree = filteredAttempts.slice(0, 3);
  const remainingRoster = filteredAttempts.slice(3);

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500" />
            Class Leaderboard & Ranking
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time student rankings calculated by score and speed
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="bg-white border border-slate-200 text-slate-800 rounded-xl px-3.5 py-2 text-xs font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Combined Exams</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} ({e.className})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Top 3 Podium Bento Row */}
      {topThree.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Rank 2 (Silver) */}
          {topThree[1] && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-between relative overflow-hidden order-2 md:order-1">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center text-lg shadow-inner mb-3 border border-slate-200">
                #2
              </div>
              <div className="text-center space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  Silver Medal
                </span>
                <h3 className="font-bold text-slate-900 text-base">{topThree[1].studentName}</h3>
                <p className="text-xs text-slate-500 font-mono">{topThree[1].studentId}</p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 w-full flex justify-around text-center">
                <div>
                  <div className="text-lg font-bold text-blue-600">{topThree[1].score}/{topThree[1].maxScore}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Score</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-700">{Math.floor(topThree[1].timeTakenSeconds / 60)}m {topThree[1].timeTakenSeconds % 60}s</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Speed</div>
                </div>
              </div>
            </div>
          )}

          {/* Rank 1 (Gold) */}
          {topThree[0] && (
            <div className="bg-gradient-to-b from-amber-50 to-white border-2 border-amber-300 rounded-2xl p-6 shadow-md flex flex-col items-center justify-between relative overflow-hidden order-1 md:order-2 transform md:-translate-y-2">
              <div className="absolute top-0 right-0 bg-amber-400 text-slate-900 font-bold text-[10px] uppercase px-3 py-1 rounded-bl-xl shadow-sm">
                Champion
              </div>
              <div className="w-16 h-16 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center text-2xl shadow-lg mb-3 ring-4 ring-amber-100">
                #1
              </div>
              <div className="text-center space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 bg-amber-100 border border-amber-200 px-3 py-0.5 rounded-full">
                  Gold Trophy
                </span>
                <h3 className="font-extrabold text-slate-900 text-lg">{topThree[0].studentName}</h3>
                <p className="text-xs text-amber-800 font-mono font-medium">{topThree[0].studentId}</p>
              </div>
              <div className="mt-4 pt-4 border-t border-amber-200/60 w-full flex justify-around text-center">
                <div>
                  <div className="text-xl font-black text-amber-600">{topThree[0].score}/{topThree[0].maxScore}</div>
                  <div className="text-[10px] text-amber-800 font-bold uppercase">Score ({topThree[0].percentage}%)</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-800">{Math.floor(topThree[0].timeTakenSeconds / 60)}m {topThree[0].timeTakenSeconds % 60}s</div>
                  <div className="text-[10px] text-amber-800 font-bold uppercase">Completion</div>
                </div>
              </div>
            </div>
          )}

          {/* Rank 3 (Bronze) */}
          {topThree[2] && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-between relative overflow-hidden order-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-lg shadow-inner mb-3 border border-amber-200">
                #3
              </div>
              <div className="text-center space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full">
                  Bronze Medal
                </span>
                <h3 className="font-bold text-slate-900 text-base">{topThree[2].studentName}</h3>
                <p className="text-xs text-slate-500 font-mono">{topThree[2].studentId}</p>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 w-full flex justify-around text-center">
                <div>
                  <div className="text-lg font-bold text-blue-600">{topThree[2].score}/{topThree[2].maxScore}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Score</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-700">{Math.floor(topThree[2].timeTakenSeconds / 60)}m {topThree[2].timeTakenSeconds % 60}s</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Speed</div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Full Leaderboard Table Card */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">All Participating Students ({filteredAttempts.length})</h3>
          <span className="text-xs text-slate-500 font-medium">Rankings auto-sort by Score and Execution Time</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider font-bold border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Rank</th>
                <th className="px-6 py-3">Student Name</th>
                <th className="px-6 py-3">Student ID</th>
                <th className="px-6 py-3">Score & Percentage</th>
                <th className="px-6 py-3">Correct / Wrong</th>
                <th className="px-6 py-3">Time Taken</th>
                <th className="px-6 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAttempts.map((att) => (
                <tr key={att.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-3.5 font-black text-slate-900">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-mono text-xs font-bold ${
                      att.rank === 1 ? 'bg-amber-400 text-slate-950' :
                      att.rank === 2 ? 'bg-slate-200 text-slate-800' :
                      att.rank === 3 ? 'bg-amber-200 text-amber-900' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      #{att.rank}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 font-bold text-slate-900">{att.studentName}</td>
                  <td className="px-6 py-3.5 font-mono text-slate-500">{att.studentId}</td>
                  <td className="px-6 py-3.5 font-bold text-blue-600">
                    {att.score} / {att.maxScore} <span className="text-slate-400 font-normal">({att.percentage}%)</span>
                  </td>
                  <td className="px-6 py-3.5 font-medium">
                    <span className="text-emerald-600 font-bold">{att.correctCount}</span> C /{' '}
                    <span className="text-rose-500 font-bold">{att.wrongCount}</span> W
                  </td>
                  <td className="px-6 py-3.5 font-mono text-slate-600">
                    {Math.floor(att.timeTakenSeconds / 60)}m {att.timeTakenSeconds % 60}s
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-medium text-[11px]">
                      Submitted
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
