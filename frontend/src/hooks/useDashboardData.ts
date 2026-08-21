import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken, clearToken } from '../api';
import type { Exam, Attempt, SystemSettings, AuditLog, Student } from '../types';

export type DashboardData = {
  exams: Exam[];
  students: Student[];
  attempts: Attempt[];
  settings: SystemSettings;
  auditLogs: AuditLog[];
};

const defaultSettings: SystemSettings = {
  telegramBotToken: '',
  webhookUrl: '',
  botUsername: '@quizbotbypusparghya_bot',
  botActive: true,
  autoPublishResults: true,
  systemNotice: '',
};

export const dashboardQueryKey = ['dashboard', 'data'] as const;

async function fetchDashboard(): Promise<DashboardData> {
  if (!getToken()) {
    throw new Error('UNAUTHORIZED');
  }
  const res = await api('/api/data');
  if (res.status === 401) {
    clearToken();
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as any).error || `Failed to load (${res.status})`);
  }
  const d = await res.json();
  return {
    exams: d.exams || [],
    students: d.students || [],
    attempts: d.attempts || [],
    settings: d.settings || defaultSettings,
    auditLogs: d.auditLogs || [],
  };
}

export function useDashboardData(enabled: boolean) {
  return useQuery({
    queryKey: dashboardQueryKey,
    queryFn: fetchDashboard,
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: (n, err) => {
      if (err instanceof Error && err.message === 'UNAUTHORIZED') return false;
      return n < 2;
    },
  });
}

export function useInvalidateDashboard() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: dashboardQueryKey });
}
