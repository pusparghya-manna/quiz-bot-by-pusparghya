import React from 'react';

/** Full-screen dim + spinner so slow saves/deletes feel responsive. */
export function ActionOverlay({
  show,
  label = 'Working…',
}: {
  show: boolean;
  label?: string;
}) {
  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/35 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-4 flex max-w-xs flex-col items-center gap-3 rounded-2xl bg-white px-6 py-5 shadow-xl border border-slate-200">
        <span
          className="inline-block h-9 w-9 rounded-full border-[3px] border-blue-500 border-t-transparent animate-spin"
          aria-hidden
        />
        <p className="text-sm font-medium text-slate-800 text-center">{label}</p>
        <p className="text-[11px] text-slate-500 text-center">Please wait — do not close this page.</p>
      </div>
    </div>
  );
}
