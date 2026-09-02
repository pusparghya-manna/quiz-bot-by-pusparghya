import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

export function PageMeta() {
  const path = window.location.pathname;
  const meta: Record<string, { title: string; description: string }> = {
    '/login': {
      title: 'Teacher Login & Registration | Quiz Bot by Pusparghya',
      description: 'Sign in or register to manage exams, students, results, and Telegram quiz workflows.',
    },
    '/privacy': {
      title: 'Privacy Policy | Quiz Bot by Pusparghya',
      description: 'Read how Quiz Bot by Pusparghya handles account, exam, Telegram Mini App, and browser storage data.',
    },
    '/terms': {
      title: 'Terms of Service | Quiz Bot by Pusparghya',
      description: 'Review the draft terms for using Quiz Bot by Pusparghya teacher and student quiz services.',
    },
    '/thank-you': {
      title: 'Thank You | Quiz Bot by Pusparghya',
      description: 'Your action was completed successfully in Quiz Bot by Pusparghya.',
    },
    '/audit-report': {
      title: 'Website Readiness Audit | Quiz Bot by Pusparghya',
      description: 'Interactive audit of the Quiz Bot website experience across SEO, accessibility, conversion, privacy, and performance.',
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

const legalNotice = 'Draft for review: the owner should confirm the legal entity, jurisdiction, effective date, retention periods, and required disclosures with a qualified lawyer before relying on this page.';

function PublicShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12"><div className="max-w-3xl mx-auto"><Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800">← Quiz Bot by Pusparghya</Link><article className="mt-6 rounded-3xl bg-white p-6 sm:p-10 shadow-sm ring-1 ring-slate-200"><h1 className="text-3xl font-black tracking-tight text-slate-950">{title}</h1>{children}</article></div></main>;
}

export function PrivacyPage() {
  return <PublicShell title="Privacy Policy"><p className="mt-3 text-sm text-slate-500">Project/service: Quiz Bot by Pusparghya · Effective date: to be confirmed</p><div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{legalNotice}</div><section className="prose prose-slate mt-8 max-w-none"><h2>Information used by the service</h2><p>The teacher dashboard may process account credentials, display names, exam content, student submissions, results, audit activity, and operational settings in order to provide the quiz-management service. The Telegram Mini App may receive Telegram-provided launch data and exam-related information when opened inside Telegram.</p><h2>Browser storage</h2><p>The current implementation uses localStorage and sessionStorage for authentication tokens, drafts, notification state, and Mini App caching. The audit found no configured analytics cookies or non-essential tracking-cookie provider.</p><h2>Service providers</h2><p>The documented deployment uses Vercel for frontend hosting and Railway for the backend/API. Telegram is used as the bot and Mini App channel. The owner should confirm the current provider list, retention periods, subprocessors, and cross-border transfer disclosures before publication.</p><h2>Your choices</h2><p>Users may contact the project owner at <a href="mailto:pusparghyamanna26@gmail.com">pusparghyamanna26@gmail.com</a> or via Telegram <a href="https://t.me/pusparghyamanna">@pusparghyamanna</a> to ask questions about their information. Requests and identity-verification procedures should be finalized by the owner.</p><h2>Contact</h2><p>Quiz Bot by Pusparghya<br />Email: pusparghyamanna26@gmail.com<br />Telegram: @pusparghyamanna</p></section></PublicShell>;
}

export function TermsPage() {
  return <PublicShell title="Terms of Service"><p className="mt-3 text-sm text-slate-500">Project/service: Quiz Bot by Pusparghya · Effective date: to be confirmed</p><div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{legalNotice}</div><section className="prose prose-slate mt-8 max-w-none"><h2>Using the service</h2><p>Quiz Bot by Pusparghya provides teacher dashboard and Telegram quiz experiences. Users are responsible for keeping credentials confidential, using the service lawfully, and ensuring that exam and student content is appropriate for the intended audience.</p><h2>Teacher responsibilities</h2><p>Teachers should obtain any permissions required to upload, store, or share student information and should review results before communicating them. The service should not be treated as a substitute for professional, educational, or legal judgment.</p><h2>Availability and changes</h2><p>The owner may update, suspend, or change features, integrations, or service limits. The owner should add final warranty, liability, dispute, governing-law, and termination clauses after confirming the legal entity and jurisdiction.</p><h2>Contact</h2><p>Questions may be sent to <a href="mailto:pusparghyamanna26@gmail.com">pusparghyamanna26@gmail.com</a> or via Telegram <a href="https://t.me/pusparghyamanna">@pusparghyamanna</a>.</p></section></PublicShell>;
}

export function ThankYouPage() {
  return <PublicShell title="Thank you"><div className="mt-6 rounded-2xl bg-blue-50 p-6 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-2xl font-black text-white">✓</div><h2 className="mt-4 text-xl font-bold text-slate-900">Your action was completed</h2><p className="mt-2 text-sm text-slate-600">You can continue to the teacher dashboard or open the student experience through Telegram.</p><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center"><Link to="/login" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700">Teacher login / Register</Link><a href="https://t.me/quizbotbypusparghya_bot" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100">Open Quiz Bot</a></div></div></PublicShell>;
}

type AuditRow = { id: number; label: string; status: 'Available' | 'Partial' | 'Missing' | 'Needs data'; detail: string; area: string };
const auditRows: AuditRow[] = [
  { id: 1, label: 'Custom 404 page', status: 'Available', detail: 'Custom React NotFound page exists and is reachable through SPA routing.', area: 'Experience' },
  { id: 2, label: 'CTA above the fold', status: 'Available', detail: 'Login/Register is visible above the fold; a stronger marketing hero is still optional.', area: 'Conversion' },
  { id: 3, label: 'Meta title per page', status: 'Partial', detail: 'Added route-aware metadata for public routes; authenticated dashboard routes still use a shared default.', area: 'SEO' },
  { id: 4, label: 'Meta description per page', status: 'Partial', detail: 'Added route-aware descriptions for public routes; dashboard route copy can be expanded later.', area: 'SEO' },
  { id: 5, label: 'Open Graph image', status: 'Available', detail: 'Added a branded static OG image and tags to the frontend shell.', area: 'SEO' },
  { id: 6, label: 'Favicon set', status: 'Available', detail: 'PNG, SVG, and Apple touch icon references are provided.', area: 'SEO' },
  { id: 7, label: 'robots.txt', status: 'Available', detail: 'Added robots.txt with public route guidance.', area: 'SEO' },
  { id: 8, label: 'sitemap.xml', status: 'Available', detail: 'Added sitemap entries for the public teacher routes and audit report.', area: 'SEO' },
  { id: 9, label: 'Alt text on every image', status: 'Available', detail: 'Teacher and student profile images now have meaningful alt text; decorative SVG icons remain hidden from assistive technology.', area: 'Accessibility' },
  { id: 10, label: 'Mobile breakpoints', status: 'Available', detail: 'Existing CSS includes mobile breakpoints and touch-friendly controls.', area: 'Responsive' },
  { id: 11, label: 'Sticky mobile CTA', status: 'Available', detail: 'Student exam flow already has a sticky action dock; teacher dashboard receives a persistent mobile create-exam CTA.', area: 'Conversion' },
  { id: 12, label: 'Loading states', status: 'Available', detail: 'Existing skeletons and action loading states are present in both apps.', area: 'Experience' },
  { id: 13, label: 'Form error states', status: 'Available', detail: 'Login and dashboard forms expose inline error feedback.', area: 'Experience' },
  { id: 14, label: 'Thank-you page', status: 'Available', detail: 'Added a reusable completion page at /thank-you.', area: 'Conversion' },
  { id: 15, label: 'Privacy policy page', status: 'Needs data', detail: 'Added a draft page using confirmed service facts; legal entity, jurisdiction, date, and retention terms remain to be confirmed.', area: 'Trust' },
  { id: 16, label: 'Terms page', status: 'Needs data', detail: 'Added a draft page; governing law, entity, liability, and effective date remain to be confirmed.', area: 'Trust' },
  { id: 17, label: 'Cookie banner', status: 'Available', detail: 'Added a consent banner explaining that no analytics/tracking cookies are configured; storage is browser storage.', area: 'Trust' },
  { id: 18, label: 'Analytics installed', status: 'Missing', detail: 'No provider or measurement ID was supplied. A consent-ready loader is present but remains inactive until configured.', area: 'Measurement' },
  { id: 19, label: 'Real contact address', status: 'Missing', detail: 'Public email and Telegram handles are confirmed; a postal/organization address was not supplied.', area: 'Trust' },
  { id: 20, label: 'Compressed images', status: 'Partial', detail: 'Existing raster assets should be checked and converted where practical; the new OG asset is lightweight SVG.', area: 'Performance' },
];

export function AuditReport() {
  const [filter, setFilter] = useState<'All' | AuditRow['status']>('All');
  const visible = useMemo(() => filter === 'All' ? auditRows : auditRows.filter((row) => row.status === filter), [filter]);
  const counts = auditRows.reduce<Record<string, number>>((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});
  const saveReport = () => {
    const text = ['Quiz Bot by Pusparghya website readiness audit', '', ...auditRows.map((row) => `${row.id}. ${row.label} — ${row.status}: ${row.detail}`)].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = 'quiz-bot-website-audit.txt'; a.click(); URL.revokeObjectURL(url);
  };
  const shareReport = async () => { const text = 'Quiz Bot by Pusparghya website readiness audit'; if (navigator.share) await navigator.share({ title: text, text, url: window.location.href }); else { await navigator.clipboard?.writeText(window.location.href); alert('Report link copied.'); } };
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12"><div className="max-w-5xl mx-auto"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Link to="/login" className="text-sm font-semibold text-blue-600">← Back to Quiz Bot</Link><h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950">Website readiness audit</h1><p className="mt-2 max-w-2xl text-sm text-slate-600">A practical review of the teacher dashboard and Telegram student Mini App across SEO, accessibility, conversion, trust, and performance.</p></div><div className="flex gap-2"><button onClick={saveReport} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-200">Save report</button><button onClick={shareReport} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Share</button></div></div><div className="mt-6 grid gap-3 sm:grid-cols-4">{(['All', 'Available', 'Partial', 'Missing', 'Needs data'] as const).map((key) => <button key={key} onClick={() => setFilter(key)} className={`rounded-2xl p-4 text-left ring-1 transition ${filter === key ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-700 ring-slate-200'}`}><div className="text-xs font-bold uppercase tracking-wider opacity-70">{key}</div><div className="mt-1 text-2xl font-black">{key === 'All' ? auditRows.length : counts[key] || 0}</div></button>)}</div><div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200"><div className="grid grid-cols-[2rem_1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 sm:grid-cols-[2rem_1.25fr_1fr_auto] sm:px-6"><span>#</span><span>Requirement</span><span className="hidden sm:block">Evidence</span><span>Status</span></div>{visible.map((row) => <div key={row.id} className="grid grid-cols-[2rem_1fr_auto] gap-3 border-b border-slate-100 px-4 py-4 last:border-0 sm:grid-cols-[2rem_1.25fr_1fr_auto] sm:px-6"><span className="text-sm font-bold text-slate-400">{row.id}</span><div><div className="font-bold text-slate-900">{row.label}</div><div className="mt-1 text-xs text-slate-500 sm:hidden">{row.detail}</div><span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{row.area}</span></div><p className="hidden text-sm leading-6 text-slate-600 sm:block">{row.detail}</p><span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${row.status === 'Available' ? 'bg-emerald-100 text-emerald-700' : row.status === 'Partial' ? 'bg-amber-100 text-amber-700' : row.status === 'Needs data' ? 'bg-violet-100 text-violet-700' : 'bg-rose-100 text-rose-700'}`}>{row.status}</span></div>)}</div><p className="mt-5 text-xs leading-5 text-slate-500">Note: the Telegram Mini App was verified from source and its unauthenticated public gate; an authenticated Telegram browser session was not available. Legal pages are drafts pending owner confirmation and legal review.</p></div></main>;
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(localStorage.getItem('quiz_cookie_notice') !== 'dismissed'); }, []);
  if (!visible) return null;
  return <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-2xl bg-slate-950 p-4 text-white shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5"><p className="text-sm leading-6 text-slate-200">This site uses browser storage for authentication and app state. No analytics or non-essential tracking cookies are currently configured. Read the <Link className="font-bold text-blue-300" to="/privacy">Privacy Policy</Link>.</p><button onClick={() => { localStorage.setItem('quiz_cookie_notice', 'dismissed'); setVisible(false); }} className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-900">Got it</button></div>;
}

export function AnalyticsLoader() {
  useEffect(() => { const domain = import.meta.env.VITE_ANALYTICS_DOMAIN; if (!domain || document.querySelector('script[data-analytics]')) return; const script = document.createElement('script'); script.defer = true; script.dataset.analytics = 'true'; script.src = 'https://plausible.io/js/script.js'; script.setAttribute('data-domain', domain); document.head.appendChild(script); }, []);
  return null;
}
