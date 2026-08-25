import React, { useState } from 'react';
import {
  Edit2,
  Check,
  X,
  ShieldCheck,
  Send
} from 'lucide-react';
import { UserProfile } from '../../types';

interface ProfileScreenProps {
  profile: UserProfile;
  onUpdateName: (newName: string) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  profile,
  onUpdateName
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(profile.name);

  const handleSave = () => {
    if (nameInput.trim()) {
      onUpdateName(nameInput.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setNameInput(profile.name);
    setIsEditing(false);
  };

  const initials = profile.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'PS';

  return (
    <div className="space-y-5 pb-12 animate-in fade-in duration-300 max-w-lg mx-auto">
      {/* Telegram-style Top Card */}
      <div className="glass-card rounded-3xl overflow-hidden shadow-xs">
        {/* Telegram Header Gradient / Background */}
        <div className="h-28 bg-gradient-to-r from-blue-600 via-sky-500 to-indigo-600 relative flex items-center justify-end px-4">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-[11px] font-bold border border-white/30 shadow-xs">
            <Send className="w-3 h-3" />
            <span>Telegram Account</span>
          </div>
        </div>

        {/* Profile Avatar & Primary Identity */}
        <div className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between -mt-14 mb-4 gap-3">
            {/* Telegram circular avatar with gradient */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-blue-600 to-sky-400 text-white font-black text-2xl flex items-center justify-center ring-4 ring-white shadow-lg select-none">
                {initials}
              </div>
              <div
                className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 ring-2 ring-white"
                title="Online"
              />
            </div>

            {/* Edit Name Button */}
            {!isEditing && (
              <button
                onClick={() => {
                  setNameInput(profile.name);
                  setIsEditing(true);
                }}
                className="px-3.5 py-2 rounded-2xl glass-btn-secondary text-slate-800 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Change Name</span>
              </button>
            )}
          </div>

          {/* Name Display or Inline Edit */}
          {isEditing ? (
            <div className="space-y-2 p-3.5 rounded-2xl glass-card-subtle mb-4 animate-in fade-in">
              <label className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block">
                Edit Display Name
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Enter your name"
                  className="flex-1 px-3 py-2 text-sm rounded-xl glass-input text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSave();
                    if (e.key === 'Escape') handleCancel();
                  }}
                />
                <button
                  onClick={handleSave}
                  className="px-3.5 py-2 rounded-xl glass-btn-primary text-white text-xs font-bold flex items-center gap-1 shadow-xs"
                  title="Save Name"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={handleCancel}
                  className="px-3 py-2 rounded-xl glass-btn-secondary text-slate-600 text-xs font-bold"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5 mb-2">
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-slate-900">
                  {profile.name}
                </h1>
                <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0" title="Verified Telegram Student" />
              </div>
              <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                online · active in Quiz Bot
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
