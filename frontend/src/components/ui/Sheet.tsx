import React from 'react';
import { IconClose } from '../../icons';

type Props = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * Responsive modal/sheet:
 * - Portrait phone: bottom sheet, full width
 * - Landscape / tablet / desktop: centered card, larger max width
 */
export function Sheet({ title, subtitle, icon, onClose, children }: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 landscape:items-center landscape:p-3"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        className="relative w-full sm:max-w-lg md:max-w-xl landscape:max-w-2xl flex flex-col bg-white rounded-t-[1.25rem] sm:rounded-2xl landscape:rounded-2xl shadow-2xl shadow-slate-900/15 border border-slate-100/80"
        style={{
          maxHeight: 'min(92dvh, 92vh)',
          marginBottom: 'max(4.25rem, env(safe-area-inset-bottom, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5 rounded-t-[1.25rem] sm:rounded-t-2xl shrink-0">
          {icon ? (
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 ring-1 ring-blue-100">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-[15px] sm:text-base font-bold text-slate-900 leading-tight truncate">
              {title}
            </h2>
            {subtitle ? (
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-500 shrink-0 hover:bg-slate-100 active:scale-95 transition"
            aria-label="Close"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>
        <div
          className="px-4 sm:px-5 py-4 overflow-y-auto flex-1 overscroll-contain"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
