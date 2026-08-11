import React from 'react';
import { RefreshCw, Settings, Send } from 'lucide-react';

interface NavbarProps {
  onReseedData: () => void;
  botActive: boolean;
  onOpenSettings: () => void;
  onScrollToSection: (sectionId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onReseedData,
  botActive,
  onOpenSettings,
  onScrollToSection
}) => {
  return (
    <header id="main-header" className="bg-white border-b border-slate-200 text-slate-900 sticky top-0 z-30 shadow-2xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        
        {/* Brand & System Title */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="w-9 h-9 bg-blue-600 text-white rounded-xl shadow-xs flex items-center justify-center font-bold text-base shrink-0">
            <Send className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg text-slate-900 tracking-tight leading-none flex items-center gap-1.5 sm:gap-2">
              TeleExam Pro
              <span className="text-[9px] sm:text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 sm:px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Telegram Bot
              </span>
            </h1>
            <p className="hidden sm:block text-xs text-slate-500 mt-0.5 font-medium">
              Examination & Quiz Dashboard
            </p>
          </div>
        </div>

        {/* Scroll Quick Navigation Links */}
        <nav className="hidden md:flex items-center space-x-1 text-xs font-bold text-slate-600 bg-slate-50 p-1 border border-slate-200 rounded-xl">
          <button
            onClick={() => onScrollToSection('dashboard-section')}
            className="px-3 py-1.5 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
          >
            Dashboard
          </button>
          <button
            onClick={() => onScrollToSection('exams-section')}
            className="px-3 py-1.5 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
          >
            Exams
          </button>
          <button
            onClick={() => onScrollToSection('results-section')}
            className="px-3 py-1.5 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
          >
            Submissions
          </button>
          <button
            onClick={() => onScrollToSection('leaderboard-section')}
            className="px-3 py-1.5 rounded-lg hover:bg-white hover:text-slate-900 transition-colors cursor-pointer"
          >
            Leaderboard
          </button>
        </nav>

        {/* Quick Actions & Status */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Bot Status Indicator */}
          <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold">
            <span className={`w-2 h-2 rounded-full ${botActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-slate-700">
              {botActive ? 'Telegram Bot Active' : 'Offline Engine'}
            </span>
          </div>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Reset System Data */}
          <button
            id="btn-reseed-data"
            onClick={onReseedData}
            title="Clear all data and reset system"
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-rose-600" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>

      </div>
    </header>
  );
};
