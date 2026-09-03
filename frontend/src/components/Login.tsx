import React, { useState } from 'react';
import { api, setToken } from '../api';
import { inp, btnP } from '../styles/ui';
import { Field } from './ui/Field';
import {
  IconEye,
  IconEyeOff,
  IconUser,
  IconHash,
  IconAlert,
  IconBook,
  IconChart,
  IconCheck,
  IconSparkles,
} from '../icons';

export function Login({ onOk }: { onOk: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [name, setName] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

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
      setToken(data.token);
      onOk();
    } catch (e: any) {
      setErr(e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === 'login';

  return (
    <main className="min-h-full relative overflow-hidden flex items-center justify-center px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-24 h-80 w-80 rounded-full bg-blue-300/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-28 h-96 w-96 rounded-full bg-indigo-300/25 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-sky-200/20 blur-3xl" />
      </div>

      <div className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/80 bg-white/70 shadow-2xl shadow-slate-300/40 backdrop-blur-xl lg:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 p-9 text-white lg:flex lg:flex-col lg:justify-between xl:p-12">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                <img src="/favicon.png" alt="" className="h-8 w-8 rounded-xl object-contain" />
              </div>
              <div>
                <p className="text-sm font-bold tracking-tight">Quiz Bot</p>
                <p className="text-[11px] text-blue-100">by Pusparghya</p>
              </div>
            </div>
            <div className="mt-20 max-w-sm">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-blue-100 ring-1 ring-white/15">
                <IconSparkles className="h-3.5 w-3.5" /> A calmer way to manage exams
              </div>
              <h1 className="text-4xl font-black leading-[1.08] tracking-tight xl:text-5xl">
                Make every assessment count.
              </h1>
              <p className="mt-5 text-sm leading-6 text-blue-100/85">
                Create engaging exams, follow student progress, and keep your results organized in one focused workspace.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-white/15 pt-6 text-[11px] text-blue-100">
            <div className="flex items-center gap-2"><IconBook className="h-4 w-4 text-cyan-200" /> Exams</div>
            <div className="flex items-center gap-2"><IconChart className="h-4 w-4 text-emerald-200" /> Insights</div>
            <div className="flex items-center gap-2"><IconCheck className="h-4 w-4 text-amber-200" /> Results</div>
          </div>
        </section>

        <section className="p-5 sm:p-8 lg:p-10 xl:p-12">
          <div className="mx-auto max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/25">
                <img src="/favicon.png" alt="Quiz Bot" className="h-9 w-9 rounded-xl object-contain" />
              </div>
              <div>
                <p className="text-base font-black tracking-tight text-slate-900">Quiz Bot</p>
                <p className="text-xs font-medium text-slate-500">Teacher workspace by Pusparghya</p>
              </div>
            </div>

            <div className="mb-7">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-600">Teacher workspace</p>
              <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                {isLogin ? 'Welcome back' : 'Create your workspace'}
              </h2>
              <p className="mt-2 text-sm leading-5 text-slate-500">
                {isLogin ? 'Sign in to continue managing your exams and students.' : 'Set up your account and start building better assessments.'}
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 rounded-xl bg-slate-100/85 p-1 ring-1 ring-slate-200/70">
              <button
                type="button"
                onClick={() => { setMode('login'); setErr(''); }}
                className={`rounded-lg px-3 py-2.5 text-xs font-bold transition ${isLogin ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/70' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setErr(''); }}
                className={`rounded-lg px-3 py-2.5 text-xs font-bold transition ${!isLogin ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/70' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Register
              </button>
            </div>

            <form onSubmit={go} className="space-y-4">
              {mode === 'register' && (
                <Field label="Full name">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconUser className="h-4 w-4" /></span>
                    <input className={inp + ' rounded-xl py-3 pl-10'} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" />
                  </div>
                </Field>
              )}
              <Field label="Username">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconHash className="h-4 w-4" /></span>
                  <input className={inp + ' rounded-xl py-3 pl-10'} value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoCapitalize="off" required placeholder="Enter your username" />
                </div>
              </Field>
              <Field label="Password">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconEyeOff className="h-4 w-4" /></span>
                  <input className={inp + ' rounded-xl py-3 pl-10 pr-11'} type={show ? 'text' : 'password'} value={p} onChange={(e) => setP(e.target.value)} autoComplete={isLogin ? 'current-password' : 'new-password'} required placeholder={isLogin ? 'Enter your password' : 'At least 8 characters'} />
                  <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                    {show ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              {err && (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-700">
                  <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{err}</span>
                </div>
              )}

              <button type="submit" disabled={busy} className={btnP + ' mt-2 w-full rounded-xl py-3 text-sm shadow-lg shadow-blue-600/20'}>
                {busy ? (isLogin ? 'Signing in…' : 'Creating account…') : (isLogin ? 'Sign in to dashboard' : 'Create teacher account')}
              </button>
            </form>

            <p className="mt-7 text-center text-[11px] leading-5 text-slate-400">
              Secure teacher access for your exam workspace.<br />
              Quiz Bot by Pusparghya
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
