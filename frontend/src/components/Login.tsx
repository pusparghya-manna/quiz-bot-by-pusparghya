import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';
import { inp } from '../styles/ui';
import { Field } from './ui/Field';
import { firebaseConfigured, firebaseGoogleLogin, firebaseIdToken } from '../firebase';
import {
  IconEye,
  IconEyeOff,
  IconUser,
  IconHash,
  IconAlert,
  IconLock,
  IconLogIn,
  IconUserPlus,
  IconArrowRight,
  IconGoogle,
} from '../icons';

export function Login({ onOk }: { onOk: () => void }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { username: u.trim(), password: p }
        : { username: u.trim(), password: p, name: name.trim() || u.trim() };
      const res = await api(path, { method: 'POST', body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || (mode === 'login' ? 'Invalid credentials' : 'Registration failed'));
      setToken(data.token, remember);
      onOk();
    } catch (e: any) {
      setErr(e.message || 'Unable to continue');
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async () => {
    setErr('');
    if (!firebaseConfigured) {
      setErr('Google sign-in is not configured yet. Use username and password instead.');
      return;
    }
    setGoogleBusy(true);
    try {
      const user = await firebaseGoogleLogin();
      const idToken = await firebaseIdToken(user);
      const res = await api('/api/auth/firebase/exchange', {
        method: 'POST',
        body: JSON.stringify({ idToken, name: user.displayName || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Google sign-in failed');
      setToken(data.token, remember);
      onOk();
    } catch (e: any) {
      setErr(e.message || 'Google sign-in failed');
    } finally {
      setGoogleBusy(false);
    }
  };

  const isLogin = mode === 'login';
  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setErr('');
  };

  return (
    <main className="min-h-[100dvh] overflow-y-auto overscroll-contain bg-[#f5f7fc] px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-[480px] flex-col items-center sm:max-w-[560px]">
        <header className="w-full text-center">
          <img
            src="/exam-bot-logo.png"
            alt="Exam Bot by Pusparghya"
            className="mx-auto h-16 w-16 rounded-full object-contain drop-shadow-[0_6px_12px_rgba(37,99,235,0.15)] sm:h-28 sm:w-28"
          />
          <p className="mt-2.5 text-base font-bold tracking-tight sm:mt-4 sm:text-2xl">
            <span className="bg-gradient-to-r from-emerald-500 via-blue-600 to-indigo-700 bg-clip-text text-transparent">Welcome back!</span>{' '}
            <span aria-hidden="true">👋</span>
          </p>
          <h1 className="mt-1 text-[1.85rem] font-black leading-none tracking-[-0.04em] text-blue-600 sm:mt-2 sm:text-[3.6rem] sm:tracking-[-0.055em]">
            Quiz Bot
          </h1>
          <p className="mt-0.5 text-[1.2rem] font-black leading-none tracking-[-0.03em] text-indigo-950 sm:mt-1 sm:text-[2.4rem] sm:tracking-[-0.045em]">
            by Pusparghya
          </p>
          <p className="mx-auto mt-2.5 max-w-[340px] text-[13px] leading-5 text-slate-500 sm:mt-5 sm:max-w-[420px] sm:text-base sm:leading-7">
            Create exams, review results, and keep your quiz workflow organized.
          </p>
        </header>

        <section className="mt-4 w-full rounded-2xl border border-white bg-white p-4 shadow-[0_12px_40px_rgba(51,65,85,0.1)] sm:mt-8 sm:rounded-[2rem] sm:p-8 sm:shadow-[0_18px_50px_rgba(51,65,85,0.12)]">
          <div className="grid grid-cols-2 border-b border-slate-200">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`relative flex items-center justify-center gap-1.5 py-2.5 text-sm font-extrabold transition sm:gap-2 sm:py-4 sm:text-lg ${isLogin ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <IconLogIn className="h-4 w-4 sm:h-6 sm:w-6" /> Sign in
              {isLogin && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-600 sm:h-1" />}
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`relative flex items-center justify-center gap-1.5 py-2.5 text-sm font-extrabold transition sm:gap-2 sm:py-4 sm:text-lg ${!isLogin ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <IconUserPlus className="h-4 w-4 sm:h-6 sm:w-6" /> Register
              {!isLogin && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-600 sm:h-1" />}
            </button>
          </div>

          <form onSubmit={go} className="space-y-3 pt-4 sm:space-y-5 sm:pt-7">
            {mode === 'register' && (
              <Field label="Full name">
                <div className="relative">
                  <IconUser className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:left-4 sm:h-5 sm:w-5" />
                  <input className={inp + ' rounded-xl border-2 py-2.5 pl-10 text-sm sm:py-3.5 sm:pl-12 sm:text-base'} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Enter your name" />
                </div>
              </Field>
            )}
            <Field label="Username">
              <div className="relative">
                <IconUser className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 sm:left-4 sm:h-5 sm:w-5" />
                <input className={inp + ' rounded-xl border-2 py-2.5 pl-10 text-sm sm:py-3.5 sm:pl-12 sm:text-base'} value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoCapitalize="off" required placeholder="Enter your username" />
              </div>
            </Field>
            <Field label="Password">
              <div className="relative">
                <IconLock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 sm:left-4 sm:h-5 sm:w-5" />
                <input className={inp + ' rounded-xl border-2 py-2.5 pl-10 pr-10 text-sm sm:py-3.5 sm:pl-12 sm:pr-12 sm:text-base'} type={show ? 'text' : 'password'} value={p} onChange={(e) => setP(e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} required placeholder={isLogin ? 'Enter your password' : 'At least 8 characters'} />
                <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 sm:right-2 sm:h-10 sm:w-10">
                  {show ? <IconEyeOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <IconEye className="h-4 w-4 sm:h-5 sm:w-5" />}
                </button>
              </div>
            </Field>

            {isLogin && (
              <div className="flex items-center justify-between gap-2 text-xs font-semibold sm:text-sm">
                <label className="flex cursor-pointer items-center gap-1.5 text-slate-600 sm:gap-2">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 sm:h-5 sm:w-5" />
                  Remember me
                </label>
                <button type="button" onClick={() => navigate('/forgot-password')} className="font-bold text-blue-600 hover:text-blue-800">Forgot password?</button>
              </div>
            )}

            {err && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700 sm:px-3.5 sm:py-3 sm:text-sm">
                <IconAlert className="mt-0.5 h-4 w-4 shrink-0 sm:h-5 sm:w-5" /> <span>{err}</span>
              </div>
            )}

            <button type="submit" disabled={busy || googleBusy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 sm:gap-3 sm:py-3.5 sm:text-base">
              {busy ? (isLogin ? 'Signing in…' : 'Creating account…') : (isLogin ? 'Sign in' : 'Create account')}
              {!busy && <IconArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />}
            </button>
          </form>

          {isLogin && (
            <>
              <div className="my-4 flex items-center gap-3 text-[11px] font-bold text-slate-500 sm:my-6 sm:text-xs">
                <span className="h-px flex-1 bg-slate-200" /> OR <span className="h-px flex-1 bg-slate-200" />
              </div>
              <button type="button" disabled={busy || googleBusy} onClick={continueWithGoogle} className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-indigo-950 transition hover:border-blue-200 hover:bg-blue-50/40 disabled:pointer-events-none disabled:opacity-60 sm:gap-3 sm:py-3.5 sm:text-base">
                <IconGoogle className="h-5 w-5" />
                {googleBusy ? 'Connecting to Google…' : 'Continue with Google'}
              </button>
              <p className="mt-4 text-center text-xs text-slate-500 sm:mt-6 sm:text-sm">
                Don&apos;t have an account?{' '}
                <button type="button" onClick={() => switchMode('register')} className="font-extrabold text-blue-600 hover:text-blue-800">Register</button>
              </p>
            </>
          )}
        </section>

        <footer className="pb-1 pt-5 text-center text-xs text-slate-500 sm:pt-8 sm:text-sm">
          <p>© {new Date().getFullYear()} Quiz Bot by Pusparghya</p>
          <nav className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 sm:mt-3 sm:gap-x-4 sm:gap-y-2">
            <button type="button" onClick={() => navigate('/privacy')} className="hover:text-blue-600">Privacy Policy</button>
            <span className="text-slate-300">•</span>
            <button type="button" onClick={() => navigate('/terms')} className="hover:text-blue-600">Terms of Service</button>
            <span className="text-slate-300">•</span>
            <button type="button" onClick={() => navigate('/contact')} className="hover:text-blue-600">Contact</button>
          </nav>
        </footer>
      </div>
    </main>
  );
}
