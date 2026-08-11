import React, { useState, useEffect, useCallback } from 'react';
import { Login } from './components/Login';
import { api, getToken, clearToken } from './api';
import { Navbar } from './components/Navbar';
import { DashboardView } from './components/views/DashboardView';
import { ExamsView } from './components/views/ExamsView';
import { ResultsView } from './components/views/ResultsView';
import { LeaderboardView } from './components/views/LeaderboardView';
import { SettingsView } from './components/views/SettingsView';
import { Exam, Question, Student, Attempt, SystemSettings, AuditLog } from './types';

export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [loading, setLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [exams, setExams] = useState<Exam[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    telegramBotToken: '',
    webhookUrl: '',
    botUsername: '@ExamMasterBot',
    botActive: true,
    autoPublishResults: true,
    systemNotice: ''
  });
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const fetchAllData = useCallback(async () => {
    if (!getToken()) return;
    try {
      setLoading(true);
      const res = await api('/api/data');
      if (res.ok) {
        const data = await res.json();
        setExams(data.exams || []);
        setQuestions(data.questions || []);
        setStudents(data.students || []);
        setAttempts(data.attempts || []);
        setSettings(data.settings || {
          telegramBotToken: '',
          webhookUrl: '',
          botUsername: '@ExamMasterBot',
          botActive: true,
          autoPublishResults: true,
          systemNotice: ''
        });
        setLogs(data.auditLogs || []);
      }
    } catch (err) {
      console.error('Error fetching data from server:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Only fetch when authenticated
  useEffect(() => {
    if (authed) {
      fetchAllData();
    }
  }, [authed, fetchAllData]);

  const handleLogout = () => {
    clearToken();
    setAuthed(false);
    setExams([]);
    setQuestions([]);
    setStudents([]);
    setAttempts([]);
    setLogs([]);
  };

  const handleScrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleReseedData = async () => {
    if (!window.confirm('Clear all data and reset system to clean state?')) return;
    try {
      setLoading(true);
      const res = await api('/api/reseed', { method: 'POST' });
      if (res.ok) {
        await fetchAllData();
        alert('Database reset successfully!');
      }
    } catch (err) {
      console.error('Failed to reset:', err);
    } finally {
      setLoading(false);
    }
  };

  // Show login — no API calls, no focus tricks
  if (!authed) {
    return (
      <Login
        onSuccess={() => {
          setAuthed(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col">
      <Navbar
        onReseedData={handleReseedData}
        botActive={settings.botActive}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onScrollToSection={handleScrollToSection}
        onLogout={handleLogout}
      />

      <main id="main-content-area" className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-12">
        {loading && exams.length === 0 ? (
          <div className="h-64 bg-white border border-slate-200 rounded-2xl flex items-center justify-center p-8 text-slate-500 font-medium text-sm shadow-sm">
            Loading dashboard…
          </div>
        ) : (
          <>
            <section id="dashboard-section" className="pt-2">
              <DashboardView
                exams={exams}
                students={students}
                attempts={attempts}
              />
            </section>

            <section id="exams-section" className="pt-4">
              <ExamsView
                exams={exams}
                questions={questions}
                onRefreshExams={fetchAllData}
              />
            </section>

            <section id="results-section" className="pt-4">
              <ResultsView
                attempts={attempts}
                exams={exams}
                onRefreshResults={fetchAllData}
              />
            </section>

            <section id="leaderboard-section" className="pt-4">
              <LeaderboardView
                attempts={attempts}
                exams={exams}
              />
            </section>
          </>
        )}
      </main>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Telegram Bot & System Settings</h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 cursor-pointer"
              >
                ✕ Close
              </button>
            </div>
            <SettingsView
              settings={settings}
              onRefreshSettings={fetchAllData}
              logs={logs}
            />
          </div>
        </div>
      )}
    </div>
  );
}
