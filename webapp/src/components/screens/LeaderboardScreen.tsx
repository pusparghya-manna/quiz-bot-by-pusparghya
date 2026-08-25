import React, { useEffect, useState } from 'react';
import { Trophy, Clock } from 'lucide-react';
import { ExamAttempt, Exam, LeaderboardRow } from '../../types';
import { webappApi } from '../../api';

interface LeaderboardScreenProps {
  pastResults: ExamAttempt[];
  exams?: Exam[];
  currentUserName: string;
  onSelectExamResult?: (attempt: ExamAttempt) => void;
}

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({
  pastResults,
  exams = [],
  currentUserName,
}) => {
  const examOptions: {
    id: string;
    title: string;
    score?: number;
    maxScore?: number;
    rank?: number | null;
    accuracy?: number;
  }[] =
    pastResults.length > 0
      ? pastResults.map((r) => ({
          id: r.examId,
          title: r.examTitle,
          score: r.score,
          maxScore: r.maxScore,
          rank: r.rank,
          accuracy: r.accuracy,
        }))
      : exams
          .filter((e) => e.status === 'ENDED' || e.status === 'RESULTS_PUBLISHED')
          .map((e) => ({ id: e.id, title: e.title }));

  const [selectedExamId, setSelectedExamId] = useState<string>(examOptions[0]?.id || '');
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [examTitle, setExamTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedExamId && examOptions[0]?.id) {
      setSelectedExamId(examOptions[0].id);
    }
  }, [examOptions, selectedExamId]);

  useEffect(() => {
    if (!selectedExamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await webappApi.leaderboard(selectedExamId);
        if (cancelled) return;
        setRows(data.rows || []);
        setExamTitle(data.exam?.title || '');
      } catch (e: any) {
        if (cancelled) return;
        setRows([]);
        setError(e?.message || 'Leaderboard unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedExamId]);

  const selectedMeta = examOptions.find((e) => e.id === selectedExamId);
  const top3 = rows.slice(0, 3);
  const me = rows.find((r) => r.isMe);

  if (examOptions.length === 0) {
    return (
      <div className="space-y-6 pb-12 animate-in fade-in duration-300">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
            Rankings & Standings
          </span>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Exam Leaderboard</h1>
        </div>
        <div className="glass-card rounded-3xl p-8 text-center">
          <Trophy className="w-8 h-8 text-blue-400 mx-auto" />
          <h3 className="font-bold text-slate-900 mt-2">No leaderboards yet</h3>
          <p className="text-xs text-slate-500 mt-1">
            Complete an exam to view rankings from the live database.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
          Rankings & Standings
        </span>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Exam Leaderboard</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Live ranks from your teacher&apos;s published leaderboards.
        </p>
      </div>

      <section className="space-y-2.5">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Select exam ({examOptions.length})
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {examOptions.map((opt) => {
            const isSelected = opt.id === selectedExamId;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedExamId(opt.id)}
                className={`p-3.5 transition text-left rounded-2xl ${
                  isSelected
                    ? 'glass-card border-blue-400/80 shadow-md ring-2 ring-blue-500/20'
                    : 'glass-card hover:scale-[1.01]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold truncate ${
                      isSelected ? 'text-blue-900' : 'text-slate-900'
                    }`}
                  >
                    {opt.title}
                  </span>
                  {isSelected && (
                    <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-600 text-white shrink-0">
                      Active
                    </span>
                  )}
                </div>
                {(opt.score !== undefined || opt.rank != null) && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/40 text-[11px]">
                    <span className="font-bold text-slate-900 font-mono">
                      {opt.score !== undefined
                        ? `${opt.score}${opt.maxScore != null ? `/${opt.maxScore}` : ''}`
                        : '—'}{' '}
                      pts
                    </span>
                    {opt.rank != null && (
                      <span className="font-bold text-blue-600 font-mono">Rank #{opt.rank}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {selectedMeta && (
        <section className="glass-card rounded-3xl p-5 md:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                Leaderboard
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">
                {examTitle || selectedMeta.title}
              </h2>
            </div>
            {(me?.rank ?? selectedMeta.rank) != null && (
              <span className="px-3 py-1 text-xs font-bold rounded-full glass-btn-primary text-white shadow-xs">
                Rank #{me?.rank ?? selectedMeta.rank}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2.5 text-center mt-3">
            <div className="p-3 rounded-2xl glass-pill bg-blue-50/60 border-blue-200/60">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Your Rank</span>
              <p className="text-base md:text-lg font-black text-blue-600 font-mono mt-0.5">
                {me?.rank ?? selectedMeta.rank ?? '—'}
              </p>
            </div>
            <div className="p-3 rounded-2xl glass-pill">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Your Score</span>
              <p className="text-base md:text-lg font-black text-slate-900 font-mono mt-0.5">
                {me?.score ?? selectedMeta.score ?? '—'}
              </p>
            </div>
            <div className="p-3 rounded-2xl glass-pill bg-emerald-50/60 border-emerald-200/60">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Accuracy</span>
              <p className="text-base md:text-lg font-black text-emerald-600 font-mono mt-0.5">
                {me?.percentage != null
                  ? `${me.percentage}%`
                  : selectedMeta.accuracy != null
                    ? `${selectedMeta.accuracy}%`
                    : '—'}
              </p>
            </div>
          </div>
        </section>
      )}

      {loading && (
        <p className="text-xs font-semibold text-blue-600 animate-pulse">Loading leaderboard…</p>
      )}
      {error && (
        <div className="glass-card rounded-2xl p-4 text-xs text-amber-800 border border-amber-200">
          {error}
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Top Rankers
            </h2>
            <div className="grid grid-cols-3 gap-2 md:gap-3">
              {[top3[1], top3[0], top3[2]].map((entry, i) => {
                if (!entry) return <div key={i} />;
                const place = entry.rank;
                const isFirst = place === 1;
                return (
                  <div
                    key={entry.rank}
                    className={`glass-card rounded-2xl p-3.5 text-center flex flex-col justify-between shadow-xs ${
                      isFirst
                        ? 'border-amber-300/80 bg-gradient-to-b from-amber-50/80 via-white/80 to-amber-50/40 -translate-y-1'
                        : ''
                    }`}
                  >
                    <div>
                      <span className="text-base mb-1 block">
                        {place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        {place === 1 ? '1st' : place === 2 ? '2nd' : '3rd'}
                      </span>
                      <h3 className="text-xs font-bold text-slate-900 mt-0.5 truncate">
                        {entry.isMe ? `${currentUserName} (You)` : entry.name}
                      </h3>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/40">
                      <p className="text-xs font-mono font-bold text-slate-800">{entry.score}</p>
                      <span className="text-[10px] text-emerald-600 font-mono font-semibold">
                        {entry.percentage}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass-card rounded-3xl overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Complete Scoreboard</h2>
              </div>
              <span className="text-xs text-slate-400 font-medium">{rows.length} ranked</span>
            </div>
            <div className="divide-y divide-slate-100/80">
              {rows.map((entry) => {
                const isMe = entry.isMe;
                const displayName = isMe ? `${currentUserName} (You)` : entry.name;
                return (
                  <div
                    key={`${entry.rank}-${entry.name}`}
                    className={`p-3.5 flex items-center justify-between gap-2 transition ${
                      isMe
                        ? 'bg-blue-50/70 border-l-4 border-blue-600 font-semibold'
                        : 'hover:bg-white/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                          entry.rank === 1
                            ? 'bg-amber-100 text-amber-700'
                            : entry.rank === 2
                              ? 'bg-slate-200 text-slate-700'
                              : entry.rank === 3
                                ? 'bg-amber-100/60 text-amber-800'
                                : isMe
                                  ? 'glass-btn-primary text-white'
                                  : 'glass-pill text-slate-600'
                        }`}
                      >
                        {entry.rank}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-xs md:text-sm font-bold truncate ${
                            isMe ? 'text-blue-900' : 'text-slate-900'
                          }`}
                        >
                          {displayName}
                        </p>
                        {entry.timeTakenSeconds != null && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {Math.floor(entry.timeTakenSeconds / 60)}m{' '}
                            {entry.timeTakenSeconds % 60}s
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs md:text-sm font-bold font-mono text-slate-900">
                        {entry.score}
                        {entry.maxScore != null ? ` / ${entry.maxScore}` : ''}
                      </p>
                      <span className="text-[10px] text-emerald-600 font-mono font-semibold">
                        {entry.percentage}% Acc
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {!loading && !error && rows.length === 0 && selectedExamId && (
        <div className="glass-card rounded-3xl p-6 text-center text-xs text-slate-500">
          No published ranks for this exam yet.
        </div>
      )}
    </div>
  );
};
