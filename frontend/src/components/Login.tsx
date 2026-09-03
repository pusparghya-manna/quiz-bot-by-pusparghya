import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, setToken } from '../api';
import { firebaseConfigured, firebaseGoogleLogin, firebaseIdToken, firebaseRegister } from '../firebase';
import { inp, btnP, card } from '../styles/ui';
import { Field } from './ui/Field';
import { IconEye, IconEyeOff, IconUser, IconHash, IconAlert } from '../icons';

function firebaseMessage(error: any) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Invalid username/email or password.';
  if (code.includes('email-already-in-use')) return 'That email is already registered. Try signing in instead.';
  if (code.includes('weak-password')) return 'Use a password with at least 8 characters.';
  if (code.includes('popup-closed')) return 'Google sign-in was cancelled.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait and try again.';
  return error?.message || 'Authentication failed. Please try again.';
}

export function Login({ onOk }: { onOk: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const exchange = async (user: any, username?: string, displayName?: string) => {
    const idToken = await firebaseIdToken(user);
    const res = await api('/api/auth/firebase/exchange', {
      method: 'POST',
      body: JSON.stringify({ idToken, username, name: displayName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Unable to finish account setup');
    setToken(data.token);
  };

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const value = identifier.trim();
    if (!value) return setError(mode === 'login' ? 'Enter your username or email.' : 'Choose a username.');
    if (mode === 'register' && !/^[A-Za-z0-9_]{3,32}$/.test(value)) return setError('Username must be 3–32 letters, numbers, or underscores.');
    if (mode === 'register' && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'register' && firebaseConfigured) {
        const user = await firebaseRegister(email, password);
        await exchange(user, value, name.trim() || value);
        setSuccess('Account created. A verification email has been sent, but you can continue to the dashboard now.');
      } else {
        const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
        const body = mode === 'login'
          ? { username: value, password }
          : { username: value, email: email.trim(), password, name: name.trim() || value };
        const res = await api(path, { method: 'POST', body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || (mode === 'login' ? 'Invalid credentials' : 'Registration failed'));
        setToken(data.token);
      }
      onOk();
    } catch (e: any) {
      setError(firebaseMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      const user = await firebaseGoogleLogin();
      await exchange(user, undefined, user.displayName || undefined);
      onOk();
    } catch (e: any) {
      setError(firebaseMessage(e));
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
          <img src="/exam-bot-logo.png" alt="Quiz Bot by Pusparghya logo" className="mx-auto w-20 h-20 rounded-2xl object-contain mb-3" />
          <p className="text-sm font-semibold text-slate-500">Welcome back!</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-blue-600">Quiz Bot</h1>
          <p className="text-base font-bold text-slate-900">by Pusparghya</p>
          <p className="text-xs text-slate-600 mt-2">Create exams, review results, and keep your quiz workflow organized.</p>
        </div>

        <div className="flex gap-1 bg-slate-200/60 p-1 rounded-lg mb-3 ring-1 ring-slate-200">
          <button type="button" onClick={() => { setMode('login'); setError(''); setSuccess(''); }} className={`flex-1 py-2 rounded-md text-sm font-bold transition ${mode === 'login' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Sign in</button>
          <button type="button" onClick={() => { setMode('register'); setError(''); setSuccess(''); }} className={`flex-1 py-2 rounded-md text-sm font-bold transition ${mode === 'register' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Register</button>
        </div>

        <form onSubmit={go} className={card + ' p-5 space-y-3 ring-1 ring-slate-200/70 shadow-xl shadow-slate-200/50'} noValidate>
          {mode === 'register' && <Field label="Full name"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconUser className="w-4 h-4" /></span><input className={inp + ' pl-10'} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" /></div></Field>}
          {mode === 'register' && <Field label="Email address"><input className={inp} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="you@example.com" /></Field>}
          <Field label={mode === 'login' ? 'Username or email' : 'Username'}><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconHash className="w-4 h-4" /></span><input className={inp + ' pl-10'} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="off" required placeholder={mode === 'login' ? 'Enter username or email' : 'Choose a username'} /></div></Field>
          <Field label="Password"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IconEyeOff className="w-4 h-4" /></span><input className={inp + ' pr-10 pl-10'} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)} className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600">{showPassword ? <IconEyeOff className="w-4 h-4" /> : <IconEye className="w-4 h-4" />}</button></div></Field>
          {mode === 'login' && <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-bold text-blue-600 hover:text-blue-800">Forgot password?</Link></div>}
          {error && <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2" role="alert"><IconAlert className="w-4 h-4 shrink-0" />{error}</div>}
          {success && <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2" role="status">{success}</div>}
          <button type="submit" disabled={busy} className={btnP + ' w-full disabled:opacity-60'}>{busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign in  →' : 'Create account')}</button>
          {firebaseConfigured && <><div className="flex items-center gap-3 text-xs font-bold text-slate-400"><span className="h-px flex-1 bg-slate-200" />OR<span className="h-px flex-1 bg-slate-200" /></div><button type="button" disabled={busy} onClick={google} className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60">Continue with Google</button></>}
        </form>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[11px] text-slate-400"><a href="https://t.me/quizbotbypusparghya_bot" className="font-bold text-blue-600 hover:text-blue-800">Open Quiz Bot in Telegram</a><Link to="/contact" className="hover:text-slate-600">Contact</Link><Link to="/privacy" className="hover:text-slate-600">Privacy</Link><Link to="/terms" className="hover:text-slate-600">Terms</Link></div>
        <p className="text-center text-xs text-slate-400 mt-3">Quiz Bot by Pusparghya</p>
      </div>
    </div>
  );
}
