import React, { useState } from 'react';
import { api, setToken } from '../api';
import { Link } from 'react-router-dom';
import { inp, btnP, card } from '../styles/ui';
import { Field } from './ui/Field';
import { IconEye, IconEyeOff, IconUser, IconHash, IconAlert } from '../icons';

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

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-5 relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="absolute -bottom-28 -left-24 w-80 h-80 rounded-full bg-indigo-200/40 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-5">
          <img src="/favicon.png" alt="Quiz Bot" className="mx-auto w-14 h-14 rounded-xl object-contain mb-3" />
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Quiz Bot by Pusparghya</h1>
          <p className="text-xs text-slate-500 mt-0.5">Teacher Dashboard</p>
          <p className="text-xs text-slate-600 mt-2">Create exams, review results, and keep your quiz workflow organized.</p>
        </div>

        <div className="flex gap-1 bg-slate-200/60 p-1 rounded-lg mb-3 ring-1 ring-slate-200">
          <button type="button" onClick={() => { setMode('login'); setErr(''); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${mode === 'login' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
            Sign in
          </button>
          <button type="button" onClick={() => { setMode('register'); setErr(''); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-bold transition ${mode === 'register' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
            Register
          </button>
        </div>

        <form onSubmit={go} className={card + ' p-4 space-y-3 ring-1 ring-slate-200/70 shadow-xl shadow-slate-200/50'}>
          {mode === 'register' && (
            <Field label="Full name">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconUser className="w-3.5 h-3.5" /></span>
                <input className={inp + ' pl-9'} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" />
              </div>
            </Field>
          )}
          <Field label="Username">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconHash className="w-3.5 h-3.5" /></span>
              <input className={inp + ' pl-9'} value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoCapitalize="off" required placeholder="Choose a username" />
            </div>
          </Field>
          <Field label="Password">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconEyeOff className="w-3.5 h-3.5" /></span>
              <input className={inp + ' pr-10 pl-9'} type={show ? 'text' : 'password'} value={p} onChange={(e) => setP(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required placeholder={mode === 'register' ? 'Min 8 characters' : 'Password'} />
              <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setShow((v) => !v)} className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600">
                {show ? <IconEyeOff className="w-3.5 h-3.5" /> : <IconEye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </Field>
          {err && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <IconAlert className="w-3.5 h-3.5 shrink-0" />{err}
            </div>
          )}
          <button type="submit" disabled={busy} className={btnP + ' w-full'}>
            {busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] text-slate-400">
          <a href="https://t.me/quizbotbypusparghya_bot" className="font-bold text-blue-600 hover:text-blue-800">Open Quiz Bot in Telegram</a>
          <Link to="/contact" className="hover:text-slate-600">Contact</Link>
          <Link to="/privacy" className="hover:text-slate-600">Privacy</Link>
          <Link to="/terms" className="hover:text-slate-600">Terms</Link>
        </div>
        <p className="text-center text-xs text-slate-400 mt-3">Quiz Bot by Pusparghya</p>
      </div>
    </div>
  );
}
