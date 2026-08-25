import React, { useState, useEffect } from 'react';
import {
  GraduationCap
} from 'lucide-react';
import {
  Exam,
  ExamAttempt,
  UserProfile,
  Question
} from './types';
import {
  MOCK_EXAMS,
  SAMPLE_INITIAL_ATTEMPT,
  SAMPLE_PAST_RESULTS
} from './data/examsData';
import {
  DesktopNavigation,
  MobileNavigation
} from './components/Navigation';
import { HomeScreen } from './components/screens/HomeScreen';
import { ExamsScreen } from './components/screens/ExamsScreen';
import { ExamDetailsScreen } from './components/screens/ExamDetailsScreen';
import { LiveExamScreen } from './components/screens/LiveExamScreen';
import { ExamReviewScreen } from './components/screens/ExamReviewScreen';
import { ResultsScreen } from './components/screens/ResultsScreen';
import { AnswersScreen } from './components/screens/AnswersScreen';
import { LeaderboardScreen } from './components/screens/LeaderboardScreen';
import { ProfileScreen } from './components/screens/ProfileScreen';
import { webappApi, getTelegramUser } from './api';

const DEFAULT_PROFILE: UserProfile = {
  name: 'Pusparghya Manna',
  studentId: 'QB-10-48219',
  classLevel: 'Class 10',
  track: 'Science & Math Track',
  telegramAccount: '@pusparghya_manna',
  avatarColor: '#2563eb',
  theme: 'light',
  soundEnabled: true,
  timerAlerts: true,
  fontSize: 'normal'
};

export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem('quizbot_profile');
      return saved ? JSON.parse(saved) : DEFAULT_PROFILE;
    } catch {
      return DEFAULT_PROFILE;
    }
  });

  const [availableExams, setAvailableExams] = useState<Exam[]>(() => {
    try {
      const saved = localStorage.getItem('quizbot_exams');
      return saved ? JSON.parse(saved) : MOCK_EXAMS;
    } catch {
      return MOCK_EXAMS;
    }
  });

  const [selectedExam, setSelectedExam] = useState<Exam>(MOCK_EXAMS[0]);

  const [ongoingAttempt, setOngoingAttempt] = useState<ExamAttempt | null>(() => {
    try {
      const saved = localStorage.getItem('quizbot_ongoing');
      return saved ? JSON.parse(saved) : SAMPLE_INITIAL_ATTEMPT;
    } catch {
      return SAMPLE_INITIAL_ATTEMPT;
    }
  });

  const [pastResults, setPastResults] = useState<ExamAttempt[]>(() => {
    try {
      const saved = localStorage.getItem('quizbot_past_results');
      return saved ? JSON.parse(saved) : SAMPLE_PAST_RESULTS;
    } catch {
      return SAMPLE_PAST_RESULTS;
    }
  });

  const [selectedResultAttempt, setSelectedResultAttempt] = useState<ExamAttempt | null>(null);

  const [currentTab, setCurrentTab] = useState<string>('home');

  // Sync profile to localStorage
  useEffect(() => {
    localStorage.setItem('quizbot_profile', JSON.stringify(profile));
  }, [profile]);

  // Save attempts to localStorage
  useEffect(() => {
    if (ongoingAttempt) {
      localStorage.setItem('quizbot_ongoing', JSON.stringify(ongoingAttempt));
    }
  }, [ongoingAttempt]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tgUser = getTelegramUser();
        if (tgUser?.id) {
          const session = await webappApi.session();
          if (!cancelled && session.student) {
            setProfile((p) => ({
              ...p,
              name: session.student!.name || p.name,
              studentId: session.student!.studentId || p.studentId,
              classLevel: session.student!.className || p.classLevel,
              telegramAccount: session.user.username
                ? `@${session.user.username}`
                : p.telegramAccount,
            }));
          }
          const { exams } = await webappApi.exams();
          if (!cancelled && exams?.length) {
            // Map API exams into UI Exam shape (questions loaded on start)
            setAvailableExams(
              exams.map((e: any) => ({
                id: e.id,
                title: e.title,
                subject: e.subject || 'General',
                classLevel: e.className || '',
                durationMinutes: e.durationMinutes || 60,
                totalMarks: e.totalMarks || 0,
                totalQuestions: e.totalQuestions || 0,
                startDate: e.startDate,
                status: e.status,
                questions: [],
              })) as any
            );
          }
          try {
            const { results } = await webappApi.results();
            if (!cancelled && results?.length) {
              setPastResults(results as any);
            }
          } catch {
            /* no results yet */
          }
        }
      } catch (err) {
        console.warn('[webapp] session load', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle launching an exam (regular scored or practice)
  const handleStartExam = (exam: Exam, isPractice: boolean = false) => {
    setSelectedExam(exam);
    const newAttempt: ExamAttempt = {
      examId: exam.id,
      examTitle: exam.title,
      classLevel: exam.classLevel,
      answers: Array(exam.questions.length).fill(null),
      marked: Array(exam.questions.length).fill(false),
      visited: Array(exam.questions.length).fill(false),
      eliminated: {},
      secondsLeft: exam.durationMinutes * 60,
      totalDurationSeconds: exam.durationMinutes * 60,
      timeSpentSeconds: 0,
      startedAt: new Date().toISOString(),
      isSubmitted: false,
      isPractice: isPractice
    };
    newAttempt.visited[0] = true;
    setOngoingAttempt(newAttempt);
    setCurrentTab('live');
  };

  // Resume ongoing exam
  const handleResumeOngoing = () => {
    if (!ongoingAttempt) return;
    const targetExam = availableExams.find(e => e.id === ongoingAttempt.examId) || availableExams[0];
    setSelectedExam(targetExam);
    setCurrentTab('live');
  };

  // Final submit exam
  const handleFinalSubmit = () => {
    if (!ongoingAttempt) return;
    const targetExam = availableExams.find(e => e.id === ongoingAttempt.examId) || selectedExam;
    const questions = targetExam.questions;

    let correct = 0;
    let wrong = 0;
    let skipped = 0;

    ongoingAttempt.answers.forEach((ans, idx) => {
      const q = questions[idx];
      if (!q) return;
      if (ans === null) {
        skipped++;
      } else if (ans === q.a) {
        correct++;
      } else {
        wrong++;
      }
    });

    const totalAttempted = correct + wrong;
    const accuracy = totalAttempted > 0 ? Math.round((correct / totalAttempted) * 100) : 0;
    const score = correct * 4 - wrong * 1;
    const maxScore = questions.length * 4;

    const completedAttempt: ExamAttempt = {
      ...ongoingAttempt,
      isSubmitted: true,
      completedAt: new Date().toISOString(),
      score,
      maxScore,
      correctCount: correct,
      wrongCount: wrong,
      skippedCount: skipped,
      accuracy,
      rank: accuracy >= 90 ? 4 : accuracy >= 70 ? 24 : 45,
      totalParticipants: 138
    };

    setPastResults(prev => [completedAttempt, ...prev.filter(p => p.examId !== completedAttempt.examId)]);
    setSelectedResultAttempt(completedAttempt);
    setOngoingAttempt(null);
    localStorage.removeItem('quizbot_ongoing');
    setCurrentTab('results');
  };

  const isLiveExamDesk = currentTab === 'live';

  // Loading Screen
  if (isLoading) {
    return (
      <div className="min-h-screen liquid-canvas-bg flex items-center justify-center p-4 relative overflow-hidden">
        <div className="liquid-orb liquid-orb-1" />
        <div className="liquid-orb liquid-orb-2" />
        <div className="text-center space-y-4 animate-in fade-in zoom-in-95 duration-200 relative z-10 glass-card p-8 rounded-3xl">
          <div className="w-16 h-16 rounded-2xl glass-btn-primary text-white flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20">
            <GraduationCap className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              Quiz Bot by Pusparghya
            </h1>
            <p className="text-xs text-slate-500 mt-1">Opening your examination desk…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen liquid-canvas-bg text-slate-900 flex flex-col relative overflow-x-hidden">
      {/* Background Liquid Light Orbs */}
      <div className="liquid-orb liquid-orb-1" />
      <div className="liquid-orb liquid-orb-2" />
      <div className="liquid-orb liquid-orb-3" />
      <div className="liquid-orb liquid-orb-4" />

      {/* Top Application Header */}
      {!isLiveExamDesk && (
        <header className="sticky top-0 z-30 glass-header px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            {/* Brand Logo & Title */}
            <div
              onClick={() => setCurrentTab('home')}
              className="flex items-center gap-3 cursor-pointer select-none group"
            >
              <div className="w-10 h-10 rounded-xl glass-btn-primary text-white flex items-center justify-center shadow-md shadow-blue-500/20 group-hover:scale-105 transition">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm md:text-base font-bold text-slate-900 leading-tight">
                  Quiz Bot by Pusparghya
                </h1>
                <p className="text-[11px] text-slate-500">
                  Assigned Examinations & Leaderboards
                </p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <DesktopNavigation
              currentTab={currentTab}
              onSelectTab={tab => {
                if (tab === 'results') {
                  setSelectedResultAttempt(null);
                }
                setCurrentTab(tab);
              }}
              hasOngoing={!!ongoingAttempt && !ongoingAttempt.isSubmitted}
            />
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-4 md:p-6 relative z-10">
        {currentTab === 'home' && (
          <HomeScreen
            profile={profile}
            ongoingAttempt={ongoingAttempt}
            availableExams={availableExams}
            onNavigate={setCurrentTab}
            onSelectExam={exam => {
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
            onSelectExam={exam => {
              setSelectedExam(exam);
              setCurrentTab('details');
            }}
            onStartExamDirect={handleStartExam}
            onResumeOngoing={handleResumeOngoing}
          />
        )}

        {currentTab === 'details' && (
          <ExamDetailsScreen
            exam={selectedExam}
            onBack={() => setCurrentTab('exams')}
            onConfirmStart={handleStartExam}
          />
        )}

        {currentTab === 'live' && ongoingAttempt && (
          <LiveExamScreen
            exam={selectedExam}
            attempt={ongoingAttempt}
            soundEnabled={profile.soundEnabled}
            onUpdateAttempt={setOngoingAttempt}
            onOpenReview={() => setCurrentTab('review')}
            onLeaveExam={() => setCurrentTab('exams')}
            onBookmarkQuestion={() => {}}
            isBookmarked={() => false}
          />
        )}

        {currentTab === 'review' && ongoingAttempt && (
          <ExamReviewScreen
            exam={selectedExam}
            attempt={ongoingAttempt}
            onReturnToLive={() => setCurrentTab('live')}
            onJumpToQuestion={() => setCurrentTab('live')}
            onFinalSubmit={handleFinalSubmit}
          />
        )}

        {currentTab === 'results' && (
          <ResultsScreen
            pastResults={pastResults}
            exams={availableExams}
            selectedAttempt={selectedResultAttempt}
            onSelectAttempt={setSelectedResultAttempt}
            onReviewAnswers={(attempt, exam) => {
              setSelectedResultAttempt(attempt);
              setSelectedExam(exam);
              setCurrentTab('answers');
            }}
            onReattempt={handleStartExam}
            onGoExams={() => setCurrentTab('exams')}
          />
        )}

        {currentTab === 'answers' && (
          <AnswersScreen
            exam={
              (selectedResultAttempt && availableExams.find(e => e.id === selectedResultAttempt.examId)) ||
              selectedExam
            }
            attempt={selectedResultAttempt || pastResults[0] || SAMPLE_INITIAL_ATTEMPT}
            onBackToResults={() => setCurrentTab('results')}
            onBookmarkQuestion={() => {}}
            isBookmarked={() => false}
          />
        )}

        {currentTab === 'leaderboard' && (
          <LeaderboardScreen
            pastResults={pastResults}
            exams={availableExams}
            currentUserName={profile.name}
            onSelectExamResult={attempt => {
              setSelectedResultAttempt(attempt);
              setCurrentTab('results');
            }}
          />
        )}

        {currentTab === 'profile' && (
          <ProfileScreen
            profile={profile}
            onUpdateName={newName => {
              setProfile(prev => ({ ...prev, name: newName }));
            }}
          />
        )}
      </main>

      {/* Mobile Bottom Dock (Hidden on active live exam desk) */}
      {!isLiveExamDesk && (
        <MobileNavigation
          currentTab={currentTab}
          onSelectTab={tab => {
            if (tab === 'results') {
              setSelectedResultAttempt(null);
            }
            setCurrentTab(tab);
          }}
          hasOngoing={!!ongoingAttempt && !ongoingAttempt.isSubmitted}
        />
      )}
    </div>
  );
}
