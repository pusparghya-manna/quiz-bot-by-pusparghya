import React from 'react';

const Logo: React.FC = () => (
  <img
    src={`${import.meta.env.BASE_URL}exam-bot-logo.png`}
    alt="Exam Bot logo"
    className="h-14 w-14 rounded-2xl object-cover bg-white shadow-md shadow-blue-500/15"
    width="56"
    height="56"
    loading="eager"
    decoding="async"
    draggable="false"
  />
);

const SkeletonBar: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton-bar rounded-full bg-slate-200/80 ${className}`} aria-hidden="true" />
);

export const LoadingSkeleton: React.FC = () => (
  <div
    className="min-h-[100dvh] liquid-canvas-bg flex items-start justify-center p-3 md:p-5"
    aria-busy="true"
    aria-live="polite"
    aria-label="Loading your examination desk"
  >
    <div className="w-full max-w-4xl">
      <div className="glass-header rounded-2xl p-3 flex items-center gap-3">
        <Logo />
        <div className="flex-1 space-y-2">
          <SkeletonBar className="h-4 w-44" />
          <SkeletonBar className="h-3 w-28" />
        </div>
        <SkeletonBar className="h-8 w-20 rounded-xl" />
      </div>

      <div className="mt-4 space-y-3">
        <section className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <SkeletonBar className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <SkeletonBar className="h-3 w-24" />
              <SkeletonBar className="h-5 w-40" />
              <SkeletonBar className="h-3 w-56 max-w-full" />
            </div>
          </div>
        </section>

        <section className="glass-card rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <SkeletonBar className="h-4 w-32" />
            <SkeletonBar className="h-6 w-16 rounded-full" />
          </div>
          <SkeletonBar className="h-5 w-3/4" />
          <SkeletonBar className="h-3 w-1/2" />
          <div className="flex gap-2 pt-1">
            <SkeletonBar className="h-7 w-24 rounded-lg" />
            <SkeletonBar className="h-7 w-20 rounded-lg" />
            <SkeletonBar className="h-7 w-24 rounded-lg" />
          </div>
          <SkeletonBar className="h-9 w-full rounded-xl" />
        </section>

        <section className="glass-card rounded-2xl p-4 space-y-3">
          <SkeletonBar className="h-4 w-36" />
          <SkeletonBar className="h-3 w-64 max-w-full" />
          <SkeletonBar className="h-10 w-full rounded-xl" />
        </section>
      </div>

      <p className="mt-4 text-center text-[11px] font-semibold text-slate-500">
        Loading your live student desk…
      </p>
    </div>
  </div>
);
