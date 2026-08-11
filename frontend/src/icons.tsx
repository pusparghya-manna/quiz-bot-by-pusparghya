import React from 'react';

type P = { className?: string };
const s = { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const IconHome = ({ className }: P) => <svg {...s} className={className}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/></svg>;
export const IconExam = ({ className }: P) => <svg {...s} className={className}><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>;
export const IconResults = ({ className }: P) => <svg {...s} className={className}><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 17V9"/><path d="M12 17V5"/><path d="M16 17v-6"/></svg>;
export const IconSettings = ({ className }: P) => <svg {...s} className={className}><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>;
export const IconPlus = ({ className }: P) => <svg {...s} className={className}><path d="M12 5v14M5 12h14"/></svg>;
export const IconTrash = ({ className }: P) => <svg {...s} className={className}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>;
export const IconEdit = ({ className }: P) => <svg {...s} className={className}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>;
export const IconLogout = ({ className }: P) => <svg {...s} className={className}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>;
export const IconCheck = ({ className }: P) => <svg {...s} className={className}><path d="M20 6 9 17l-5-5"/></svg>;
export const IconUpload = ({ className }: P) => <svg {...s} className={className}><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 20h16"/></svg>;
export const IconEye = ({ className }: P) => <svg {...s} className={className}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>;
export const IconEyeOff = ({ className }: P) => <svg {...s} className={className}><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-3.2 4.3"/><path d="M6.1 6.1C4 7.8 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1"/></svg>;
export const IconBot = ({ className }: P) => <svg {...s} className={className}><rect x="5" y="8" width="14" height="10" rx="2"/><path d="M12 8V5"/><path d="M9 18v2"/><path d="M15 18v2"/><path d="M9 13h.01"/><path d="M15 13h.01"/></svg>;
export const IconRefresh = ({ className }: P) => <svg {...s} className={className}><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>;
export const IconClose = ({ className }: P) => <svg {...s} className={className}><path d="M18 6 6 18M6 6l12 12"/></svg>;
export const IconChevron = ({ className }: P) => <svg {...s} className={className}><path d="M9 18l6-6-6-6"/></svg>;
export const IconUsers = ({ className }: P) => <svg {...s} className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>;
export const IconLive = ({ className }: P) => <svg {...s} className={className}><circle cx="12" cy="12" r="3"/><path d="M5 5a10 10 0 0 1 0 14"/><path d="M19 5a10 10 0 0 0 0 14"/></svg>;
