import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export function PageMeta() {
  const path = window.location.pathname;
  const meta: Record<string, { title: string; description: string }> = {
    '/login': {
      title: 'Teacher Login | Quiz Bot by Pusparghya',
      description: 'Sign in or register to manage exams, students, results, and Telegram quiz workflows.',
    },
    '/privacy': {
      title: 'Privacy Policy | Quiz Bot by Pusparghya',
      description: 'Learn how Quiz Bot by Pusparghya handles account, exam, Telegram, and browser storage data.',
    },
    '/terms': {
      title: 'Terms of Service | Quiz Bot by Pusparghya',
      description: 'Read the terms for using the Quiz Bot by Pusparghya teacher dashboard and Telegram quiz service.',
    },
    '/contact': {
      title: 'Contact | Quiz Bot by Pusparghya',
      description: 'Contact Quiz Bot by Pusparghya for support, questions, and service enquiries.',
    },
    '/thank-you': {
      title: 'Thank You | Quiz Bot by Pusparghya',
      description: 'Your action was completed successfully in Quiz Bot by Pusparghya.',
    },
  };
  const current = meta[path] || {
    title: 'Quiz Bot by Pusparghya | Teacher Dashboard',
    description: 'Manage exams, students, results, and Telegram quiz workflows with Quiz Bot by Pusparghya.',
  };
  useEffect(() => {
    document.title = current.title;
    let tag = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!tag) { tag = document.createElement('meta'); tag.name = 'description'; document.head.appendChild(tag); }
    tag.content = current.description;
    const canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (canonical) canonical.href = `https://quiz-bot-by-pusparghya.vercel.app${path}`;
  }, [current.description, current.title, path]);
  return null;
}

function PublicShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12"><div className="max-w-3xl mx-auto"><Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800">← Quiz Bot by Pusparghya</Link><article className="mt-6 rounded-3xl bg-white p-6 sm:p-10 shadow-sm ring-1 ring-slate-200"><h1 className="text-3xl font-black tracking-tight text-slate-950">{title}</h1>{children}</article></div></main>;
}

export function PrivacyPage() {
  return <PublicShell title="Privacy Policy"><p className="mt-3 text-sm text-slate-500">Last updated: September 2, 2026</p><section className="prose prose-slate mt-8 max-w-none"><h2>What this service does</h2><p>Quiz Bot by Pusparghya provides a teacher dashboard and a Telegram quiz experience for creating exams, managing students, and reviewing results.</p><h2>Information we use</h2><p>Depending on how you use the service, we may process your account username, display name, authentication information, exam content, student submissions, results, audit activity, and operational settings. When you open the Mini App through Telegram, Telegram may provide launch information needed to authenticate the session.</p><h2>Browser storage</h2><p>The applications use localStorage and sessionStorage for authentication tokens, drafts, notification state, and Mini App caching. These are functional browser-storage technologies used to operate the service. We do not currently use analytics cookies or third-party advertising cookies.</p><h2>Service providers</h2><p>The service uses Vercel for frontend hosting, Railway for backend hosting, and Telegram for the bot and Mini App channel. Information may be processed by these providers only as needed to operate, secure, and maintain the service.</p><h2>Retention and security</h2><p>We retain information for as long as needed to provide the service, maintain records, resolve issues, and meet applicable obligations. We use reasonable technical and organizational measures to protect information, but no internet service can guarantee absolute security.</p><h2>Your questions</h2><p>For privacy questions or requests, contact <a href="mailto:pusparghyamanna26@gmail.com">pusparghyamanna26@gmail.com</a> or message <a href="https://t.me/pusparghyamanna">@pusparghyamanna</a> on Telegram.</p></section></PublicShell>;
}

export function TermsPage() {
  return <PublicShell title="Terms of Service"><p className="mt-3 text-sm text-slate-500">Last updated: September 2, 2026</p><section className="prose prose-slate mt-8 max-w-none"><h2>Acceptance</h2><p>By using Quiz Bot by Pusparghya, you agree to use the teacher dashboard and Telegram quiz service responsibly and in accordance with applicable law.</p><h2>Accounts</h2><p>You are responsible for keeping your account credentials secure and for all activity performed through your account. Do not share credentials or use another person’s account without permission.</p><h2>Content and student information</h2><p>Teachers are responsible for ensuring that exam content, uploaded material, and student information may lawfully be used and shared through the service. Do not upload content that is unlawful, harmful, infringing, or unrelated to the service.</p><h2>Service availability</h2><p>We work to keep the service useful and available, but features may change and temporary interruptions may occur for maintenance, security, infrastructure, or circumstances outside our control.</p><h2>Responsible use</h2><p>You must not attempt to disrupt the service, bypass authentication, access data that is not yours, or use the service to harm others. We may restrict access when necessary to protect the service and its users.</p><h2>Contact</h2><p>Questions about these terms can be sent to <a href="mailto:pusparghyamanna26@gmail.com">pusparghyamanna26@gmail.com</a> or via <a href="https://t.me/pusparghyamanna">@pusparghyamanna</a>.</p></section></PublicShell>;
}

export function ContactPage() {
  return <PublicShell title="Contact"><p className="mt-3 text-sm text-slate-500">We are happy to help with access, exams, results, and service questions.</p><div className="mt-8 grid gap-4 sm:grid-cols-3"><a href="mailto:pusparghyamanna26@gmail.com" className="rounded-2xl bg-blue-50 p-5 ring-1 ring-blue-100 hover:bg-blue-100"><div className="text-xs font-bold uppercase tracking-wider text-blue-600">Email</div><div className="mt-2 break-words font-bold text-slate-900">pusparghyamanna26@gmail.com</div></a><a href="https://t.me/pusparghyamanna" className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200 hover:bg-slate-100"><div className="text-xs font-bold uppercase tracking-wider text-blue-600">Telegram support</div><div className="mt-2 font-bold text-slate-900">@pusparghyamanna</div></a><a href="https://t.me/quizbotbypusparghya_bot" className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200 hover:bg-slate-100"><div className="text-xs font-bold uppercase tracking-wider text-blue-600">Open the bot</div><div className="mt-2 font-bold text-slate-900">@quizbotbypusparghya_bot</div></a></div><p className="mt-8 text-sm leading-6 text-slate-600">When contacting support, include the page or feature you were using and a short description of the issue. Please do not send passwords or private student information by email or Telegram.</p></PublicShell>;
}

export function ThankYouPage() {
  return <PublicShell title="Thank you"><div className="mt-6 rounded-2xl bg-blue-50 p-6 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-2xl font-black text-white">✓</div><h2 className="mt-4 text-xl font-bold text-slate-900">Your action was completed</h2><p className="mt-2 text-sm text-slate-600">Continue to the teacher dashboard or open the student experience through Telegram.</p><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center"><Link to="/login" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">Teacher login / Register</Link><a href="https://t.me/quizbotbypusparghya_bot" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100">Open Quiz Bot</a></div></div></PublicShell>;
}
