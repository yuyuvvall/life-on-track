import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workLogsApi } from '@/api/client';
import type { CreateWorkLogRequest } from '@/types';

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

export function useCreateWorkLog() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateWorkLogRequest) => workLogsApi.create(data, 'Log daily integrity'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['weeklySummary'] });
    },
  });
}

export function useUpdateWorkLog() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateWorkLogRequest> }) =>
      workLogsApi.update(id, data, 'Update integrity log'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['weeklySummary'] });
    },
  });
}
