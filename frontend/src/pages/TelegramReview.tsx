import { useEffect, useMemo, useState, type CSSProperties } from 'react';

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

export default function TelegramReview() {
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [focusQ, setFocusQ] = useState<number | null>(null);

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
      // Never leave a focused field that could reopen the native keyboard
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
          setError(json.error || 'Failed to load review');
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

  useEffect(() => {
    if (focusQ == null) return;
    const el = document.getElementById(`q-${focusQ}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusQ, filter]);

  if (loading) {
    return (
      <div style={styles.shell}>
        <div style={styles.card}>⏳ Loading review…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={styles.shell}>
        <div style={styles.card}>
          <b>Could not open review</b>
          <p style={{ marginTop: 8, opacity: 0.85 }}>{error || 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  const { summary, exam } = data;

  return (
    <div style={styles.shell}>
      <header style={styles.sticky}>
        <div style={styles.title}>{exam.title}</div>
        <div style={styles.stats}>
          <span>Q {summary.total}</span>
          <span>✅ {summary.correct}</span>
          <span>❌ {summary.wrong}</span>
          <span>○ {summary.unattempted}</span>
          <span>
            ⭐ {summary.score}/{summary.maxScore}
          </span>
          <span>{summary.accuracy}%</span>
        </div>
        <div style={styles.filters}>
          {(
            [
              ['all', 'ALL'],
              ['correct', '✅ CORRECT'],
              ['wrong', '❌ WRONG'],
              ['unattempted', '○ SKIPPED'],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              style={{
                ...styles.filterBtn,
                ...(filter === key ? styles.filterActive : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={styles.grid}>
          {data.questions.map((q) => {
            const bg =
              q.status === 'correct' ? '#dcfce7' : q.status === 'wrong' ? '#fee2e2' : '#f3f4f6';
            const color =
              q.status === 'correct' ? '#166534' : q.status === 'wrong' ? '#991b1b' : '#4b5563';
            return (
              <button
                key={q.id}
                type="button"
                id={`grid-${q.index}`}
                onClick={() => {
                  setFilter('all');
                  setFocusQ(q.index);
                  setTimeout(() => setFocusQ(q.index), 50);
                }}
                style={{
                  ...styles.gridBtn,
                  background: bg,
                  color,
                  outline: focusQ === q.index ? '2px solid #2563eb' : 'none',
                }}
                title={`Q${q.index + 1}`}
              >
                {q.index + 1}
              </button>
            );
          })}
        </div>
      </header>

      <main style={styles.main}>
        {filtered.map((q) => {
          const statusLabel =
            q.status === 'correct' ? '✅ Status: Right' : q.status === 'wrong' ? '❌ Status: Wrong' : '○ Status: Unattempted';
          return (
            <article key={q.id} id={`q-${q.index}`} style={styles.qCard}>
              <div style={styles.qBlock}>
                <b>
                  Q{q.index + 1}. {q.question}
                </b>
              </div>
              <div style={styles.statusLine}>{statusLabel}</div>
              {q.options.map((opt, oi) => {
                const isCorrect = q.correctIndex === oi;
                const isSelected = q.selectedIndex === oi;
                let prefix = '○';
                if (isCorrect) prefix = '✅';
                else if (isSelected && q.status === 'wrong') prefix = '❌';
                return (
                  <div
                    key={oi}
                    style={{
                      ...styles.opt,
                      fontWeight: isCorrect || isSelected ? 600 : 400,
                      color: isCorrect ? '#166534' : isSelected && q.status === 'wrong' ? '#991b1b' : '#111827',
                    }}
                  >
                    {prefix} {letter(oi)}. {opt}
                  </div>
                );
              })}
              {(q.status === 'wrong' || q.status === 'unattempted') && q.correctIndex != null && (
                <div style={styles.correctHint}>
                  <b>✓ Correct Answer:</b> {letter(q.correctIndex)}. {q.options[q.correctIndex]}
                </div>
              )}
              <div style={styles.divider} />
            </article>
          );
        })}
        {filtered.length === 0 && (
          <div style={styles.card}>No questions in this filter.</div>
        )}
      </main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#0f172a',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  },
  sticky: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
    color: '#f8fafc',
    padding: '12px 12px 10px',
    borderBottom: '1px solid #334155',
  },
  title: { fontWeight: 700, fontSize: 16, marginBottom: 8 },
  stats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    fontSize: 12,
    opacity: 0.95,
    marginBottom: 10,
  },
  filters: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  filterBtn: {
    border: '1px solid #475569',
    background: '#1e293b',
    color: '#e2e8f0',
    borderRadius: 999,
    padding: '6px 10px',
    fontSize: 11,
    fontWeight: 600,
  },
  filterActive: { background: '#2563eb', borderColor: '#2563eb', color: '#fff' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))',
    gap: 4,
    maxHeight: 120,
    overflowY: 'auto',
  },
  gridBtn: {
    border: 'none',
    borderRadius: 8,
    height: 32,
    fontSize: 12,
    fontWeight: 700,
  },
  main: {
    padding: '12px 12px 40px',
    background: '#f1f5f9',
  },
  qCard: { marginBottom: 4 },
  qBlock: {
    background: '#fff',
    borderRadius: 12,
    padding: '12px 14px',
    border: '1px solid #e2e8f0',
    marginBottom: 8,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: 1.45,
    fontSize: 14,
  },
  statusLine: { fontSize: 13, fontWeight: 700, marginBottom: 6 },
  opt: {
    fontSize: 13,
    lineHeight: 1.4,
    padding: '2px 0',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  correctHint: {
    marginTop: 8,
    fontSize: 13,
    color: '#166534',
    background: '#ecfdf5',
    borderRadius: 8,
    padding: '8px 10px',
  },
  divider: {
    height: 1,
    background: '#cbd5e1',
    margin: '14px 0',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    color: '#0f172a',
  },
};
