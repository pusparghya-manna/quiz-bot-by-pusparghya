import React, { useEffect } from 'react';
import { IconClose } from '../../icons';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="absolute inset-0 bg-slate-900/50" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }} />
      <div
        className="relative w-full sm:max-w-lg flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl"
        style={{ maxHeight: 'min(90dvh, 90vh)', marginBottom: 'max(4.5rem, env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-3 py-3 rounded-t-2xl shrink-0">
          <h2 className="text-sm font-bold text-slate-900 truncate pr-2">{title}</h2>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
            className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 shrink-0 active:bg-slate-200"
            aria-label="Close"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>
        <div className="p-3.5 overflow-y-auto flex-1 overscroll-contain" style={{ paddingBottom: '1.5rem' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

