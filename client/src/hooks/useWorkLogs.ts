import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workLogsApi } from '@/api/client';
import type { CreateWorkLogRequest } from '@/types';

export function useWorkLogs() {
  return useQuery({
    queryKey: ['workLogs'],
    queryFn: workLogsApi.getAll,
  });
}

export function useTodayWorkLog() {
  return useQuery({
    queryKey: ['workLogs', 'today'],
    queryFn: workLogsApi.getToday,
  });
}

export function useWorkLogByDate(date: string) {
  return useQuery({
    queryKey: ['workLogs', 'date', date],
    queryFn: () => workLogsApi.getByDate(date),
    enabled: !!date,
  });
}

export function useCreateWorkLog() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateWorkLogRequest) => workLogsApi.create(data),
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
      workLogsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workLogs'] });
      queryClient.invalidateQueries({ queryKey: ['weeklySummary'] });
    },
  });
}

