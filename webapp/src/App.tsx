import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import { Exam, ExamAttempt, UserProfile, Question, OngoingSummary } from './types';
import { DesktopNavigation, MobileNavigation } from './components/Navigation';
import { HomeScreen } from './components/screens/HomeScreen';
import { ExamsScreen } from './components/screens/ExamsScreen';
import { ExamDetailsScreen } from './components/screens/ExamDetailsScreen';
import { LiveExamScreen } from './components/screens/LiveExamScreen';
import { ExamReviewScreen } from './components/screens/ExamReviewScreen';
import { ResultsScreen } from './components/screens/ResultsScreen';
import { AnswersScreen } from './components/screens/AnswersScreen';
import { LeaderboardScreen } from './components/screens/LeaderboardScreen';
import { ProfileScreen } from './components/screens/ProfileScreen';
import { ActionLoadingSkeleton, LoadingSkeleton, type ActionLoadingKind } from './components/LoadingSkeleton';
import {
  webappApi,
  getTelegramUser,
  waitForTelegramInitData,
  ApiExamSummary,
  ApiAttempt,
  ApiQuestion,
} from './api';

const EMPTY_PROFILE: UserProfile = {
  name: '',
  studentId: '',
  classLevel: '',
  track: '',
  telegramAccount: '',
  avatarColor: '#2563eb',
  theme: 'light',
  soundEnabled: true,
  timerAlerts: true,
  fontSize: 'normal',
};

function mapExam(e: ApiExamSummary): Exam {
  return {
    id: e.id,
    title: e.title,
    subject: e.subject || '',
    className: e.className || '',
    totalQuestions: e.totalQuestions || 0,
    durationMinutes: e.durationMinutes || 60,
    totalMarks: e.totalMarks || 0,
    startDate: e.startDate,
    status: e.status,
    resultVisibility: e.resultVisibility,
    leaderboardVisibility: e.leaderboardVisibility,
    negativeMarking: e.negativeMarking ?? 0,
    questions: [],
  };
}

function mapQuestions(qs: ApiQuestion[]): Question[] {
  return (qs || []).map((q) => ({
    id: q.id,
    question: q.question || '',
    options: Array.isArray(q.options) ? q.options : [],
    marks: q.marks ?? 1,
    negativeMarks: q.negativeMarks ?? 0,
    subject: q.subject,
    imageFileId: q.imageFileId,
    imageUrl: q.imageUrl,
    explanation: q.explanation,
    selectedIndex: q.selectedIndex,
    correctIndex: q.correctIndex,
    status: q.status,
  }));
}

function mapAttemptFromStart(
  attempt: ApiAttempt,
  exam: ApiExamSummary,
  questions: ApiQuestion[],
  secondsLeft: number
): ExamAttempt {
  const qs = mapQuestions(questions);
  const firstId = qs[0]?.id;
  const answers = { ...(attempt.answers || {}) };
  const visited: Record<string, boolean> = {};
  if (firstId) visited[firstId] = true;
  for (const id of Object.keys(answers)) visited[id] = true;
  return {
    id: attempt.id,
    examId: exam.id,
    examTitle: exam.title,
    className: exam.className,
    answers,
    marked: {},
    visited,
    secondsLeft: Math.max(0, secondsLeft),
    totalDurationSeconds: Math.max(60, (exam.durationMinutes || 60) * 60),
    timeSpentSeconds: attempt.timeTakenSeconds || 0,
    startedAt: attempt.startedAt || new Date().toISOString(),
    isSubmitted: false,
    isOfficial: attempt.isOfficial,
    attemptNumber: attempt.attemptNumber,
    currentQuestionIndex: attempt.currentQuestionIndex || 0,
    questions: qs,
    status: attempt.status,
  };
}

function mapResult(
  r: ApiAttempt & { examTitle?: string; resultVisibility?: string }
): ExamAttempt {
  const correct = r.correctCount ?? 0;
  const wrong = r.wrongCount ?? 0;
  const attempted = correct + wrong;
  return {
    id: r.id,
    examId: r.examId,
    examTitle: r.examTitle || 'Exam',
    answers: { ...(r.answers || {}) },
    marked: {},
    visited: {},
    secondsLeft: 0,
    totalDurationSeconds: r.timeTakenSeconds || 0,
    timeSpentSeconds: r.timeTakenSeconds || 0,
    startedAt: r.startedAt || '',
    submittedAt: r.submittedAt,
    completedAt: r.submittedAt || undefined,
    isSubmitted: true,
    isOfficial: r.isOfficial,
    attemptNumber: r.attemptNumber,
    score: r.score,
    maxScore: r.maxScore,
    percentage: r.percentage,
    correctCount: r.correctCount,
    wrongCount: r.wrongCount,
    skippedCount: r.skippedCount,
    accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
    rank: r.rank,
    status: r.status,
    resultVisibility: r.resultVisibility,
  };
}

const WEBAPP_CACHE_KEY = 'quizbot_webapp_cache_v1';

function readWebappCache(): {
  profile?: UserProfile;
  exams?: Exam[];
  results?: ExamAttempt[];
  ongoingSummary?: OngoingSummary | null;
} | null {
  try {
    const raw = localStorage.getItem(WEBAPP_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeWebappCache(data: {
  profile?: UserProfile;
  exams?: Exam[];
  results?: ExamAttempt[];
  ongoingSummary?: OngoingSummary | null;
}) {
  try {
    const prev = readWebappCache() || {};
    localStorage.setItem(WEBAPP_CACHE_KEY, JSON.stringify({ ...prev, ...data, updatedAt: Date.now() }));
  } catch {
    /* quota / private mode */
  }
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inTelegram, setInTelegram] = useState(false);
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [availableExams, setAvailableExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [ongoingAttempt, setOngoingAttempt] = useState<ExamAttempt | null>(null);
  const [ongoingSummary, setOngoingSummary] = useState<OngoingSummary | null>(null);
  const [pastResults, setPastResults] = useState<ExamAttempt[]>([]);
  const [selectedResultAttempt, setSelectedResultAttempt] = useState<ExamAttempt | null>(null);
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
  const [currentTab, setCurrentTab] = useState('home');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionLoading, setActionLoading] = useState<ActionLoadingKind | null>(null);

  const refreshResults = useCallback(async () => {
    const { results } = await webappApi.results();
    const mapped = (results || []).map(mapResult);
    setPastResults(mapped);
    writeWebappCache({ results: mapped });
  }, []);

  const refreshExams = useCallback(async () => {
    const { exams } = await webappApi.exams();
    const mapped = (exams || []).map(mapExam);
    setAvailableExams(mapped);
    writeWebappCache({ exams: mapped });
    return mapped;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = readWebappCache();
    if (cached) {
      if (cached.profile) setProfile(cached.profile);
      if (cached.exams) setAvailableExams(cached.exams);
      if (cached.results) setPastResults(cached.results);
      if (cached.ongoingSummary !== undefined) setOngoingSummary(cached.ongoingSummary ?? null);
      setIsLoading(false);
    }
    (async () => {
      const tg = await waitForTelegramInitData();
      setInTelegram(tg);
      if (!tg) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      try {
        const session = await webappApi.session();
        if (cancelled) return;
        const tgUser = getTelegramUser();
        const displayName =
          session.student?.name ||
          [session.user?.firstName, session.user?.lastName].filter(Boolean).join(' ') ||
          tgUser?.first_name ||
          'Student';
        const sid =
          session.student?.studentId ||
          (session.user?.id ? `TG-${session.user.id}` : '') ||
          (tgUser?.id ? `TG-${tgUser.id}` : '');
        setProfile({
          name: displayName,
          studentId: sid,
          classLevel: session.student?.className || '',
          track: session.user?.id ? `Telegram ID ${session.user.id}` : '',
          telegramAccount: session.user?.username
            ? `@${session.user.username}`
            : tgUser?.username
              ? `@${tgUser.username}`
              : '',
          telegramUserId: session.user?.id || tgUser?.id,
          avatarColor: '#2563eb',
          theme: 'light',
          soundEnabled: true,
          timerAlerts: true,
          fontSize: 'normal',
          photoUrl: (session.user as any)?.photo_url || (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.photo_url) || null,
        });
        if (session.ongoing) setOngoingSummary(session.ongoing);
        writeWebappCache({
          profile: {
            name: displayName,
            studentId: sid,
            classLevel: session.student?.className || '',
            track: session.user?.id ? `Telegram ID ${session.user.id}` : '',
            telegramAccount: session.user?.username
              ? `@${session.user.username}`
              : tgUser?.username
                ? `@${tgUser.username}`
                : '',
            telegramUserId: session.user?.id || tgUser?.id,
            avatarColor: '#2563eb',
            theme: 'light',
            soundEnabled: true,
            timerAlerts: true,
            fontSize: 'normal',
            photoUrl: (session.user as any)?.photo_url || null,
          },
          ongoingSummary: session.ongoing || null,
        });
        const examList = await refreshExams();
        try {
          await refreshResults();
        } catch {
          /* none yet */
        }

        const params = new URLSearchParams(window.location.search);
        const reviewAttemptId = params.get('a');
        const linkedExamId = params.get('exam');

        if (linkedExamId && !reviewAttemptId) {
          let linkedExam = examList.find((exam) => exam.id === linkedExamId) || null;
          if (!linkedExam) {
            try {
              const { exam } = await webappApi.examDetail(linkedExamId);
              linkedExam = mapExam(exam);
            } catch {
              linkedExam = null;
            }
          }
          if (linkedExam && !cancelled) {
            setSelectedExam(linkedExam);
            setCurrentTab('details');
          }
        }
        if (reviewAttemptId) {
          try {
            const data = await webappApi.review(reviewAttemptId);
            if (!cancelled) {
              setReviewQuestions(mapQuestions(data.questions));
              setSelectedResultAttempt(
                mapResult({ ...data.attempt, examTitle: data.exam.title })
              );
              setSelectedExam({
                id: data.exam.id,
                title: data.exam.title,
                subject: data.exam.subject || '',
                className: '',
                totalQuestions: data.questions.length,
                durationMinutes: 0,
                totalMarks: data.attempt.maxScore || 0,
                status: 'RESULTS_PUBLISHED',
              });
              setCurrentTab('answers');
            }
          } catch {
            /* ignore deep link errors */
          }
        }
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || 'Failed to load session');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshExams, refreshResults]);

  const handleStartExam = async (exam: Exam, forceNew = false) => {
    setActionError(null);
    setBusy(true);
    setActionLoading('start');
    try {
      // Prefer fresh detail metadata
      try {
        const { exam: detail } = await webappApi.examDetail(exam.id);
        exam = { ...exam, ...mapExam(detail) };
      } catch {
        /* use list summary */
      }
      if (exam.startDate) {
        const startMs = new Date(exam.startDate).getTime();
        if (Number.isFinite(startMs) && Date.now() < startMs) {
          throw new Error(
            `Exam has not started yet. It opens at ${new Date(startMs).toLocaleString()}.`
          );
        }
      }
      const data = await webappApi.startExam(exam.id, forceNew);
      if (!data.questions?.length) {
        throw new Error('This exam has no questions yet. Ask your teacher to publish questions.');
      }
      const mapped = mapAttemptFromStart(
        data.attempt,
        data.exam,
        data.questions,
        data.secondsLeft
      );
      setSelectedExam({
        ...mapExam(data.exam),
        questions: mapped.questions,
      });
      setOngoingAttempt(mapped);
      setOngoingSummary(null);
      setCurrentTab('live');
    } catch (err: any) {
      setActionError(err?.message || 'Failed to start exam');
    } finally {
      setBusy(false);
      setActionLoading(null);
    }
  };

  const handleResumeOngoing = async () => {
    const examId = ongoingAttempt?.examId || ongoingSummary?.examId;
    if (!examId) return;
    const exam =
      availableExams.find((e) => e.id === examId) ||
      ({
        id: examId,
        title: ongoingSummary?.examTitle || ongoingAttempt?.examTitle || 'Exam',
        subject: '',
        className: '',
        totalQuestions: ongoingSummary?.totalQuestions || 0,
        durationMinutes: 60,
        totalMarks: 0,
        status: 'LIVE',
      } as Exam);
    await handleStartExam(exam, false);
  };

  const handleFinalSubmit = async () => {
    if (!ongoingAttempt) return;
    setActionError(null);
    setBusy(true);
    setActionLoading('submit');
    try {
      const { attempt } = await webappApi.submit(ongoingAttempt.id);
      const completed = mapResult({
        ...attempt,
        examTitle: ongoingAttempt.examTitle,
      });
      setPastResults((prev) => [completed, ...prev.filter((p) => p.id !== completed.id)]);
      setSelectedResultAttempt(completed);
      setOngoingAttempt(null);
      setOngoingSummary(null);
      setCurrentTab('results');
      try {
        await refreshResults();
      } catch {
        /* */
      }
    } catch (err: any) {
      setActionError(err?.message || 'Failed to submit exam');
    } finally {
      setBusy(false);
      setActionLoading(null);
    }
  };

  const handleReviewAnswers = async (attempt: ExamAttempt) => {
    setActionError(null);
    setBusy(true);
    try {
      const data = await webappApi.review(attempt.id);
      setReviewQuestions(mapQuestions(data.questions));
      setSelectedResultAttempt(mapResult({ ...data.attempt, examTitle: data.exam.title }));
      setSelectedExam({
        id: data.exam.id,
        title: data.exam.title,
        subject: data.exam.subject || '',
        className: '',
        totalQuestions: data.questions.length,
        durationMinutes: 0,
        totalMarks: data.attempt.maxScore || 0,
        status: 'RESULTS_PUBLISHED',
        questions: mapQuestions(data.questions),
      });
      setCurrentTab('answers');
    } catch (err: any) {
      setActionError(err?.message || 'Could not load solutions (results may be unpublished)');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateName = async (newName: string) => {
    setProfile((p) => ({ ...p, name: newName }));
    try {
      const { student } = await webappApi.updateProfile(newName);
      setProfile((p) => ({
        ...p,
        name: student.name || newName,
        studentId: student.studentId || p.studentId,
        classLevel: student.className || p.classLevel,
      }));
    } catch (err: any) {
      setActionError(err?.message || 'Could not save name');
    }
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!inTelegram) {
    return (
      <div className="min-h-screen liquid-canvas-bg flex items-center justify-center p-4 relative overflow-hidden">
        <div className="liquid-orb liquid-orb-1" />
        <div className="liquid-orb liquid-orb-2" />
        <div className="text-center space-y-4 relative z-10 glass-card p-8 rounded-3xl max-w-sm w-full">
          <img
            src={`${import.meta.env.BASE_URL}exam-bot-logo.png`}
            alt="Exam Bot logo"
            className="w-16 h-16 rounded-2xl object-cover bg-white mx-auto shadow-lg shadow-blue-500/15"
            width="64"
            height="64"
            loading="eager"
            decoding="async"
            draggable="false"
          />
          <div>
            <h1 className="text-lg font-bold text-slate-900">Telegram login required</h1>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Open <strong>Quiz Bot by Pusparghya</strong> inside Telegram and tap{' '}
              <strong>Open App</strong>. Browser links cannot load your student account or exams.
            </p>
          </div>
          <div className="rounded-2xl glass-pill px-3 py-2 text-[11px] text-slate-600 font-semibold">
            No Telegram initData · access blocked
          </div>
        </div>
      </div>
    );
  }

  const isLiveExamDesk = currentTab === 'live';

  return (
    <div className="app-shell compact-ui min-h-[100dvh] liquid-canvas-bg text-slate-900 flex flex-col relative overflow-x-clip">
      <div className="liquid-orb liquid-orb-1" />
      <div className="liquid-orb liquid-orb-2" />
      <div className="liquid-orb liquid-orb-3" />
      <div className="liquid-orb liquid-orb-4" />

      {!isLiveExamDesk && (
        <header className="sticky top-0 z-30 glass-header px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div
              onClick={() => setCurrentTab('home')}
              className="flex items-center gap-3 cursor-pointer select-none group"
            >
              <img
                src={`${import.meta.env.BASE_URL}exam-bot-logo.png`}
                alt="Exam Bot logo"
                className="w-10 h-10 rounded-xl object-cover bg-white shadow-md shadow-blue-500/20"
                width="40"
                height="40"
                loading="eager"
                decoding="async"
                draggable="false"
              />
              <div>
                <h1 className="text-sm md:text-base font-bold text-slate-900 leading-tight">
                  Quiz Bot by Pusparghya
                </h1>
              </div>
            </div>
            <DesktopNavigation
              currentTab={currentTab}
              onSelectTab={(tab) => {
                if (tab === 'results') setSelectedResultAttempt(null);
                setCurrentTab(tab);
              }}
              hasOngoing={
                !!(ongoingAttempt && !ongoingAttempt.isSubmitted) || !!ongoingSummary
              }
            />
          </div>
        </header>
      )}

      <main className="app-content flex-1 w-full max-w-4xl mx-auto p-3 md:p-5 pb-24 md:pb-8 relative z-10">
        {loadError && (
          <div className="mb-4 glass-card rounded-2xl p-4 border border-rose-200/60 flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-slate-900">Could not load data</p>
              <p className="text-xs text-slate-600 mt-0.5">{loadError}</p>
            </div>
          </div>
        )}
        {actionError && (
          <div className="mb-4 glass-card rounded-2xl p-3 border border-rose-200/60 text-xs text-rose-700 font-semibold">
            {actionError}
          </div>
        )}
        {busy && !actionLoading && (
          <div className="mb-3 text-xs font-semibold text-blue-600 animate-pulse">Working…</div>
        )}

        {currentTab === 'home' && (
          <HomeScreen
            profile={profile}
            ongoingAttempt={ongoingAttempt}
            ongoingSummary={ongoingSummary}
            availableExams={availableExams}
            onNavigate={setCurrentTab}
            onSelectExam={(exam) => {
              setSelectedExam(exam);
              setCurrentTab('details');
            }}
            onResumeOngoing={handleResumeOngoing}
          />
        )}

        {currentTab === 'exams' && (
          <ExamsScreen
            exams={availableExams}
            pastResults={pastResults}
            ongoingAttempt={ongoingAttempt}
            ongoingSummary={ongoingSummary}
            onSelectExam={(exam) => {
              setSelectedExam(exam);
              setCurrentTab('details');
            }}
            onStartExamDirect={(exam) => handleStartExam(exam, true)}
            onResumeOngoing={handleResumeOngoing}
          />
        )}

        {currentTab === 'details' && selectedExam && (
          <ExamDetailsScreen
            exam={selectedExam}
            onBack={() => setCurrentTab('exams')}
            onConfirmStart={(exam) => handleStartExam(exam, false)}
          />
        )}

        {currentTab === 'live' && ongoingAttempt && (
          <LiveExamScreen
            exam={
              selectedExam ||
              ({
                id: ongoingAttempt.examId,
                title: ongoingAttempt.examTitle,
              } as Exam)
            }
            attempt={ongoingAttempt}
            soundEnabled={profile.soundEnabled}
            onUpdateAttempt={setOngoingAttempt}
            onOpenReview={() => setCurrentTab('review')}
            onLeaveExam={() => setCurrentTab('exams')}
            onTimeUp={handleFinalSubmit}
          />
        )}

        {currentTab === 'review' && ongoingAttempt && (
          <ExamReviewScreen
            exam={
              selectedExam ||
              ({
                id: ongoingAttempt.examId,
                title: ongoingAttempt.examTitle,
              } as Exam)
            }
            attempt={ongoingAttempt}
            onReturnToLive={() => setCurrentTab('live')}
            onJumpToQuestion={(idx) => {
              setOngoingAttempt((a) =>
                a ? { ...a, currentQuestionIndex: idx } : a
              );
              setCurrentTab('live');
            }}
            onFinalSubmit={handleFinalSubmit}
          />
        )}

        {currentTab === 'results' && (
          <ResultsScreen
            pastResults={pastResults}
            exams={availableExams}
            selectedAttempt={selectedResultAttempt}
            onSelectAttempt={setSelectedResultAttempt}
            onReviewAnswers={handleReviewAnswers}
            onReattempt={(exam) => handleStartExam(exam, true)}
            onGoExams={() => setCurrentTab('exams')}
          />
        )}

        {currentTab === 'answers' && (
          <AnswersScreen
            examTitle={selectedResultAttempt?.examTitle || selectedExam?.title || 'Exam'}
            questions={reviewQuestions}
            onBackToResults={() => setCurrentTab('results')}
          />
        )}

        {currentTab === 'leaderboard' && (
          <LeaderboardScreen
            pastResults={pastResults}
            exams={availableExams}
            currentUserName={profile.name || 'You'}
            onSelectExamResult={(attempt) => {
              setSelectedResultAttempt(attempt);
              setCurrentTab('results');
            }}
          />
        )}

        {currentTab === 'profile' && (
          <ProfileScreen profile={profile} onUpdateName={handleUpdateName} />
        )}
      </main>

      {actionLoading && <ActionLoadingSkeleton kind={actionLoading} />}

      {!isLiveExamDesk && (
        <MobileNavigation
          currentTab={currentTab}
          onSelectTab={(tab) => {
            if (tab === 'results') setSelectedResultAttempt(null);
            setCurrentTab(tab);
          }}
          hasOngoing={
            !!(ongoingAttempt && !ongoingAttempt.isSubmitted) || !!ongoingSummary
          }
        />
      )}
    </div>
  );
}
