import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, setToken } from '../api';
import { firebaseConfigured, firebaseGoogleLogin, firebaseIdToken, firebaseRegister } from '../firebase';
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

function SignInIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-4M21 19a2 2 0 0 1-2 2h-4" /></svg>;
}
function RegisterIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5M19 8v6M16 11h6" /></svg>;
}
function LockIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>;
}
function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

export function Login({ onOk }: { onOk: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
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

  const go = async (e: FormEvent) => {
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
        setSuccess('Account created. A verification email has been sent.');
      } else {
        const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
        const body = mode === 'login'
          ? { username: value, password, remember }
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
    if (!firebaseConfigured) return setError('Google sign-in is not configured yet.');
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
    <main className="login-page">
      <div className="login-orb login-orb-top" />
      <div className="login-orb login-orb-bottom" />
      <div className="login-content">
        <header className="login-hero">
          <img src="/exam-bot-logo.png" alt="Quiz Bot by Pusparghya logo" className="login-logo" />
          <p className="login-welcome"><span>Welcome back!</span> <span aria-hidden="true">👋</span></p>
          <h1><span>Quiz Bot</span><strong>by Pusparghya</strong></h1>
          <p className="login-tagline">Create exams, review results, and<br className="login-tagline-break" /> keep your quiz workflow organized.</p>
        </header>

        <section className="login-card" aria-label="Teacher authentication">
          <div className="login-tabs" role="tablist" aria-label="Authentication options">
            <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError(''); setSuccess(''); }} className={mode === 'login' ? 'active' : ''}><SignInIcon /> <span>Sign in</span></button>
            <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError(''); setSuccess(''); }} className={mode === 'register' ? 'active' : ''}><RegisterIcon /> <span>Register</span></button>
          </div>

          <form onSubmit={go} className="login-form" noValidate>
            {mode === 'register' && <Field label="Full name"><div className="login-input-wrap"><IconUser className="login-field-icon" /><input className="login-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" /></div></Field>}
            {mode === 'register' && <Field label="Email address"><input className="login-input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="you@example.com" /></Field>}
            <Field label={mode === 'login' ? 'Username or email' : 'Username'}><div className="login-input-wrap"><IconHash className="login-field-icon" /><input className="login-input login-input-with-icon" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="off" required placeholder={mode === 'login' ? 'Enter your username' : 'Choose a username'} /></div></Field>
            <Field label="Password"><div className="login-input-wrap"><LockIcon /><input className="login-input login-input-with-icon login-input-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((v) => !v)} className="login-password-toggle">{showPassword ? <IconEyeOff /> : <IconEye />}</button></div></Field>

            {mode === 'login' && <div className="login-options"><label><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span className="login-checkmark">✓</span><span>Remember me</span></label><Link to="/forgot-password">Forgot password?</Link></div>}
            {error && <div className="login-alert" role="alert"><IconAlert /> <span>{error}</span></div>}
            {success && <div className="login-success" role="status">{success}</div>}
            <button type="submit" disabled={busy} className="login-submit">{busy ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : <><span>{mode === 'login' ? 'Sign in' : 'Create account'}</span>{mode === 'login' && <ArrowIcon />}</>}</button>

            {mode === 'login' && <><div className="login-divider"><span /> <strong>OR</strong> <span /></div><button type="button" disabled={busy} onClick={google} className="login-google"><span className="login-google-g">G</span><span>Continue with Google</span></button><p className="login-switch">Don't have an account? <button type="button" onClick={() => { setMode('register'); setError(''); setSuccess(''); }}>Register</button></p></>}
          </form>
        </section>

        <footer className="login-footer"><p>© 2026 Quiz Bot by Pusparghya</p><nav><Link to="/privacy">Privacy Policy</Link><span>•</span><Link to="/terms">Terms of Service</Link><span>•</span><Link to="/contact">Contact</Link></nav></footer>
      </div>
    </main>
  );
}
