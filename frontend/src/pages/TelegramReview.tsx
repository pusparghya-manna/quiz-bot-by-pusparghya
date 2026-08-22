import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

type QStatus = 'correct' | 'wrong' | 'unattempted';
type Filter = 'all' | 'correct' | 'wrong' | 'unattempted';

interface ReviewQuestion {
  index: number;
  id: string;
  question: string;
  options: string[];
  correctIndex: number | null;
  selectedIndex: number | null;
  status: QStatus;
}

interface ReviewPayload {
  exam: { id: string; title: string; subject: string };
  attempt: {
    id: string;
    score: number;
    maxScore: number;
    percentage: number;
    studentName?: string;
  };
  summary: {
    total: number;
    correct: number;
    wrong: number;
    unattempted: number;
    score: number;
    maxScore: number;
    accuracy: number;
  };
  questions: ReviewQuestion[];
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        close: () => void;
        themeParams?: Record<string, string>;
        colorScheme?: string;
        MainButton?: { hide: () => void };
        BackButton?: { show: () => void; hide: () => void; onClick: (cb: () => void) => void };
      };
    };
  }
}

function letter(i: number) {
  return String.fromCharCode(65 + i);
}

function statusLabel(s: QStatus): string {
  if (s === 'correct') return 'Correct';
  if (s === 'wrong') return 'Wrong';
  return 'Skipped';
}

export default function TelegramReview() {
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [bookmarks, setBookmarks] = useState<Record<string, boolean>>({});
  const [gridCollapsed, setGridCollapsed] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const attemptId = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    return q.get('a') || q.get('attemptId') || '';
  }, []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    try {
      tg?.ready();
      tg?.expand();
      tg?.MainButton?.hide();
      const ae = document.activeElement as HTMLElement | null;
      if (ae && typeof ae.blur === 'function') ae.blur();
    } catch {
      /* ignore */
    }

    async function load() {
      if (!attemptId) {
        setError('Missing attempt id');
        setLoading(false);
        return;
      }
      const initData = window.Telegram?.WebApp?.initData || '';
      if (!initData) {
        setError('Open this page from the Telegram bot (Review answers button).');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/telegram/webapp-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, attemptId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError((json as { error?: string }).error || 'Failed to load review');
          setLoading(false);
          return;
        }
        setData(json as ReviewPayload);
      } catch {
        setError('Network error loading review');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [attemptId]);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.questions;
    return data.questions.filter((q) => q.status === filter);
  }, [data, filter]);

  const onScroll = useCallback(() => {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const prev = lastScrollY.current;
      const delta = y - prev;

      if (y < 40) {
        setGridCollapsed(false);
      } else if (delta > 10 && y > 100) {
        setGridCollapsed(true);
      } else if (delta < -12) {
        setGridCollapsed(false);
      }

      lastScrollY.current = y;
      ticking.current = false;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  const jumpTo = (index: number) => {
    const el = document.getElementById(`q-${index}`);
    if (el) {
      setGridCollapsed(true);
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const toggleBookmark = (id: string) => {
    setBookmarks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div style={s.shell}>
        <div style={s.centerCard}>⏳ Loading review…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={s.shell}>
        <div style={s.centerCard}>
          <b style={{ fontSize: 16 }}>Could not open review</b>
          <p style={{ marginTop: 8, color: '#64748b', fontSize: 14 }}>{error || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const { summary, exam, attempt } = data;
  const scorePct = Math.round(attempt.percentage ?? summary.accuracy ?? 0);

  return (
    <div style={s.shell}>
      <header style={s.header}>
        <div style={s.headerTop}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={s.headerTitleRow}>
              <span style={s.headerIcon}>📋</span>
              <h1 style={s.headerTitle}>Review Answers</h1>
            </div>
            <p style={s.examName}>{exam.title}</p>
          </div>
          <div style={s.scoreBadge}>
            <span style={s.scoreStar}>⭐</span>
            <div>
              <div style={s.scoreNums}>
                {summary.score} / {summary.maxScore}
              </div>
              <div style={s.scorePct}>Score ({scorePct}%)</div>
            </div>
          </div>
        </div>

        <div style={s.filterRow}>
          {(
            [
              ['all', 'ALL QUESTIONS', summary.total, '#2563eb', '#eff6ff'],
              ['correct', 'CORRECT', summary.correct, '#16a34a', '#f0fdf4'],
              ['wrong', 'WRONG', summary.wrong, '#dc2626', '#fef2f2'],
              ['unattempted', 'SKIPPED', summary.unattempted, '#d97706', '#fffbeb'],
            ] as [Filter, string, number, string, string][]
          ).map(([key, label, count, color, bg]) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                style={{
                  ...s.filterCard,
                  borderColor: active ? color : '#e2e8f0',
                  background: active ? bg : '#fff',
                  boxShadow: active ? `0 0 0 1px ${color}33` : 'none',
                }}
              >
                <span style={{ ...s.filterCount, color: active ? color : '#0f172a' }}>{count}</span>
                <span style={{ ...s.filterLabel, color: active ? color : '#64748b' }}>
                  {key === 'all' && '▦ '}
                  {key === 'correct' && '✅ '}
                  {key === 'wrong' && '❌ '}
                  {key === 'unattempted' && '○ '}
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Sticky collapsible question grid */}
      <div style={s.gridSticky}>
        {gridCollapsed ? (
          <button
            type="button"
            style={s.compactBar}
            onClick={() => setGridCollapsed(false)}
            aria-expanded={false}
          >
            <span style={s.compactBarLeft}>☰ Questions · {filtered.length}</span>
            <span style={s.compactBarRight}>Show grid ▾</span>
          </button>
        ) : (
          <div style={s.gridPanel}>
            <div style={s.gridPanelHead}>
              <span style={s.gridHint}>Tap a number to jump · scroll down to hide</span>
              <button type="button" style={s.collapseBtn} onClick={() => setGridCollapsed(true)}>
                Hide ▴
              </button>
            </div>
            <div style={s.grid}>
              {filtered.map((q) => {
                const bg =
                  q.status === 'correct'
                    ? '#dcfce7'
                    : q.status === 'wrong'
                      ? '#fee2e2'
                      : '#f1f5f9';
                const color =
                  q.status === 'correct'
                    ? '#15803d'
                    : q.status === 'wrong'
                      ? '#b91c1c'
                      : '#64748b';
                const border =
                  q.status === 'correct'
                    ? '#86efac'
                    : q.status === 'wrong'
                      ? '#fca5a5'
                      : '#e2e8f0';
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => jumpTo(q.index)}
                    style={{
                      ...s.gridBtn,
                      background: bg,
                      color,
                      borderColor: border,
                    }}
                    aria-label={`Go to question ${q.index + 1}`}
                  >
                    {q.index + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <main style={s.main}>
        {filtered.map((q) => {
          const bookmarked = !!bookmarks[q.id];
          return (
            <article key={q.id} id={`q-${q.index}`} style={s.qCard}>
              <div style={s.qHead}>
                <div style={s.qHeadLeft}>
                  <span style={s.qNum}>Q{q.index + 1}</span>
                  <span
                    style={{
                      ...s.statusPill,
                      background:
                        q.status === 'correct'
                          ? '#dcfce7'
                          : q.status === 'wrong'
                            ? '#fee2e2'
                            : '#fef3c7',
                      color:
                        q.status === 'correct'
                          ? '#15803d'
                          : q.status === 'wrong'
                            ? '#b91c1c'
                            : '#b45309',
                    }}
                  >
                    {q.status === 'correct' && '✅ '}
                    {q.status === 'wrong' && '❌ '}
                    {q.status === 'unattempted' && '○ '}
                    {statusLabel(q.status)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleBookmark(q.id)}
                  style={{
                    ...s.bookmarkBtn,
                    color: bookmarked ? '#2563eb' : '#94a3b8',
                  }}
                  aria-label="Bookmark"
                >
                  {bookmarked ? '🔖' : '📑'} Bookmark
                </button>
              </div>

              <p style={s.qText}>{q.question}</p>

              <div style={s.opts}>
                {(q.options || []).map((opt, oi) => {
                  const isCorrect = q.correctIndex != null && q.correctIndex === oi;
                  const isSelected = q.selectedIndex != null && q.selectedIndex === oi;
                  const isWrongPick = isSelected && q.status === 'wrong';

                  let optStyle: CSSProperties = { ...s.opt };
                  if (isCorrect) {
                    optStyle = {
                      ...optStyle,
                      background: '#dcfce7',
                      borderColor: '#86efac',
                      color: '#14532d',
                    };
                  } else if (isWrongPick) {
                    optStyle = {
                      ...optStyle,
                      background: '#fee2e2',
                      borderColor: '#fca5a5',
                      color: '#7f1d1d',
                    };
                  }

                  return (
                    <div key={oi} style={optStyle}>
                      <span style={s.optMark}>
                        {isCorrect ? '✅' : isWrongPick ? '❌' : '○'}
                      </span>
                      <span style={s.optBody}>
                        <b>{letter(oi)}.</b> {opt}
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}

        {filtered.length === 0 && (
          <div style={s.centerCard}>No questions in this filter.</div>
        )}
      </main>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  shell: {
    minHeight: '100vh',
    background: '#f8fafc',
    color: '#0f172a',
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Bengali", "Hind Siliguri", sans-serif',
    WebkitFontSmoothing: 'antialiased',
  },
  centerCard: {
    margin: 24,
    padding: 20,
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
    textAlign: 'center',
    color: '#0f172a',
  },
  header: {
    background: '#fff',
    padding: '14px 14px 12px',
    borderBottom: '1px solid #e2e8f0',
  },
  headerTop: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  headerTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: { fontSize: 18 },
  headerTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: '#0f172a',
  },
  examName: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#64748b',
    lineHeight: 1.35,
    wordBreak: 'break-word',
  },
  scoreBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 14,
    padding: '8px 12px',
    flexShrink: 0,
  },
  scoreStar: { fontSize: 18 },
  scoreNums: {
    fontSize: 15,
    fontWeight: 800,
    color: '#92400e',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  scorePct: {
    fontSize: 11,
    color: '#b45309',
    fontWeight: 600,
  },
  filterRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 8,
  },
  filterCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '10px 4px',
    borderRadius: 12,
    border: '1.5px solid #e2e8f0',
    background: '#fff',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  filterCount: {
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.2,
  },
  filterLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.02em',
    textAlign: 'center',
    lineHeight: 1.25,
  },
  gridSticky: {
    position: 'sticky',
    top: 0,
    zIndex: 40,
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  compactBar: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '10px 14px',
    border: 'none',
    background: '#fff',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
  },
  compactBarLeft: {
    fontSize: 13,
    fontWeight: 700,
    color: '#0f172a',
  },
  compactBarRight: {
    fontSize: 12,
    fontWeight: 600,
    color: '#2563eb',
  },
  gridPanel: {
    padding: '8px 10px 10px',
    background: '#fff',
  },
  gridPanelHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  gridHint: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 1.3,
  },
  collapseBtn: {
    border: 'none',
    background: 'transparent',
    color: '#2563eb',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '4px 0',
    whiteSpace: 'nowrap',
    WebkitTapHighlightColor: 'transparent',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(10, minmax(0, 1fr))',
    gap: 5,
    width: '100%',
    boxSizing: 'border-box',
  },
  gridBtn: {
    width: '100%',
    minWidth: 0,
    aspectRatio: '1',
    borderRadius: 8,
    border: '1px solid',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  main: {
    padding: '12px 12px 48px',
  },
  qCard: {
    background: '#fff',
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
    padding: '14px 14px 12px',
    marginBottom: 12,
  },
  qHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  qHeadLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  qNum: {
    fontSize: 15,
    fontWeight: 800,
    color: '#0f172a',
  },
  statusPill: {
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 999,
    padding: '3px 10px',
    whiteSpace: 'nowrap',
  },
  bookmarkBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '4px 0',
    whiteSpace: 'nowrap',
    WebkitTapHighlightColor: 'transparent',
  },
  qText: {
    margin: '0 0 12px',
    fontSize: 14,
    lineHeight: 1.55,
    color: '#0f172a',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  },
  opts: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  opt: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    fontSize: 13,
    lineHeight: 1.45,
  },
  optMark: {
    flexShrink: 0,
    fontSize: 14,
    lineHeight: 1.4,
  },
  optBody: {
    minWidth: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  },
};
