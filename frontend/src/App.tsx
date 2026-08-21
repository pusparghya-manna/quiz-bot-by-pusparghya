import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ProtectedRoute } from './components/routing/ProtectedRoute';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { Login } from './components/Login';
import { getToken } from './api';

const HomePage = lazy(() => import('./pages/routePages').then((m) => ({ default: m.HomePage })));
const ExamsPage = lazy(() => import('./pages/routePages').then((m) => ({ default: m.ExamsPage })));
const ResultsPage = lazy(() => import('./pages/routePages').then((m) => ({ default: m.ResultsPage })));
const SettingsPage = lazy(() => import('./pages/routePages').then((m) => ({ default: m.SettingsPage })));

function LoginRoute() {
  const navigate = useNavigate();
  const loc = useLocation();
  if (getToken()) {
    const dest = (loc.state as any)?.from || '/';
    return <Navigate to={dest} replace />;
  }
  return (
    <Login
      onOk={() => {
        const dest = (loc.state as any)?.from || '/';
        navigate(dest, { replace: true });
      }}
    />
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="text-4xl font-bold text-slate-800">404</div>
      <p className="mt-2 text-sm text-slate-500">Page not found</p>
      <a href="/" className="mt-4 text-blue-600 text-sm font-semibold">
        Go home
      </a>
    </div>
  );
}

function LazyFallback() {
  return (
    <div className="py-24 text-center">
      <div className="mx-auto w-8 h-8 rounded-xl border-2 border-blue-200 border-t-blue-600 animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LazyFallback />}>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="exams" element={<ExamsPage />} />
          <Route path="exams/new" element={<ExamsPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
