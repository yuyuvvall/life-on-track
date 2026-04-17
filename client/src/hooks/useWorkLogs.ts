import { useQuery } from '@tanstack/react-query';
import { workLogsApi } from '@/api/client';
import type { WorkLog, CreateWorkLogRequest } from '@/types';
import { useOptimisticMutation } from './useOptimisticMutation';

export function useWorkLogs(purpose = 'Load work logs') {
  return useQuery({
    queryKey: ['workLogs'],
    queryFn: () => workLogsApi.getAll(purpose),
  });
}

export function useTodayWorkLog(purpose = 'Check daily integrity status') {
  return useQuery({
    queryKey: ['workLogs', 'today'],
    queryFn: () => workLogsApi.getToday(purpose),
  });
}

export function useWorkLogByDate(date: string, purpose = 'View work log') {
  return useQuery({
    queryKey: ['workLogs', 'date', date],
    queryFn: () => workLogsApi.getByDate(date, purpose),
    enabled: !!date,
  });
}

const TEMP_WORK_LOG_ID = -1;

export function useCreateWorkLog() {
  return useOptimisticMutation<WorkLog, CreateWorkLogRequest>({
    mutationFn: (data) => workLogsApi.create(data, 'Log daily integrity'),
    queryKeys: [['workLogs']],
    optimisticUpdate: (qc, data) => {
      const tempLog: WorkLog = {
        id: TEMP_WORK_LOG_ID,
        logDate: data.logDate,
        integrityScore: data.integrityScore,
        missedOpportunityNote: data.missedOpportunityNote ?? null,
        successNote: data.successNote ?? null,
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData<WorkLog | null>(['workLogs', 'today'], tempLog);
      qc.setQueryData<WorkLog | null>(['workLogs', 'date', data.logDate], tempLog);
      qc.setQueryData<WorkLog[]>(['workLogs'], (old) =>
        old ? [tempLog, ...old] : [tempLog],
      );
    },
    onServerSuccess: (qc, log) => {
      qc.setQueryData<WorkLog | null>(['workLogs', 'today'], log);
      qc.setQueryData<WorkLog | null>(['workLogs', 'date', log.logDate], log);
      qc.setQueryData<WorkLog[]>(['workLogs'], (old) =>
        old ? [log, ...old.filter((l) => l.id !== TEMP_WORK_LOG_ID)] : [log],
      );
    },
    invalidateOnSettled: [['weeklySummary']],
    errorMessage: 'Could not log integrity',
  });
}

export function useUpdateWorkLog() {
  return useOptimisticMutation<
    WorkLog,
    { id: number; data: Partial<CreateWorkLogRequest> }
  >({
    mutationFn: ({ id, data }) => workLogsApi.update(id, data, 'Update integrity log'),
    queryKeys: [['workLogs']],
    optimisticUpdate: (qc, { id, data }) => {
      const merge = (log: WorkLog | null | undefined): WorkLog | null | undefined => {
        if (!log || log.id !== id) return log;
        return {
          ...log,
          ...(data.integrityScore !== undefined && { integrityScore: data.integrityScore }),
          ...(data.missedOpportunityNote !== undefined && {
            missedOpportunityNote: data.missedOpportunityNote ?? null,
          }),
          ...(data.successNote !== undefined && {
            successNote: data.successNote ?? null,
          }),
          ...(data.logDate !== undefined && { logDate: data.logDate }),
        };
      };
      qc.setQueryData<WorkLog | null>(['workLogs', 'today'], (old) => merge(old) ?? null);
      qc.setQueriesData<WorkLog | null>(
        { queryKey: ['workLogs', 'date'] },
        (old) => merge(old) ?? null,
      );
      qc.setQueryData<WorkLog[]>(['workLogs'], (old) =>
        old?.map((l) => merge(l) ?? l),
      );
    },
    onServerSuccess: (qc, log) => {
      qc.setQueryData<WorkLog | null>(['workLogs', 'today'], (old) =>
        old && old.id === log.id ? log : old,
      );
      qc.setQueryData<WorkLog | null>(['workLogs', 'date', log.logDate], log);
      qc.setQueryData<WorkLog[]>(['workLogs'], (old) =>
        old?.map((l) => (l.id === log.id ? log : l)),
      );
    },
    invalidateOnSettled: [['weeklySummary']],
    errorMessage: 'Could not update integrity log',
  });
}
