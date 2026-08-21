import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Branded 404 — illustration + glass card matching product art direction.
 */
export function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-b from-[#eef4ff] via-[#f5f8ff] to-white relative overflow-hidden">
      {/* soft blobs */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-blue-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 w-80 h-80 rounded-full bg-indigo-200/25 blur-3xl" />

      <div className="relative w-full max-w-md flex flex-col items-center text-center">
        <img
          src="/404-illustration.jpg"
          alt="404 — page not found"
          className="w-full max-w-sm sm:max-w-md h-auto object-contain drop-shadow-sm select-none"
          draggable={false}
        />

        {/* Overlay actions if image already has copy — still add accessible controls below for reliability */}
        <div className="mt-2 sm:-mt-16 relative z-10 w-full max-w-xs mx-auto">
          <div className="rounded-2xl bg-white/80 backdrop-blur-md border border-white/60 shadow-lg shadow-blue-900/5 px-5 py-4 sm:py-5">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Oops! Page not found
            </h1>
            <p className="mt-1.5 text-[12px] sm:text-sm text-slate-500 leading-relaxed">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
            <Link
              to="/"
              className="mt-4 inline-flex items-center justify-center gap-1.5 w-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold py-2.5 shadow-md shadow-blue-600/25 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99] transition"
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 10v10h14V10" />
              </svg>
              Go to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
