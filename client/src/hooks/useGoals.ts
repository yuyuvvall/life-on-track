import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { goalsApi } from '@/api/client';
import type { CreateGoalRequest, UpdateGoalRequest, CreateGoalLogRequest } from '@/types';

export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn: goalsApi.getAll,
  });
}

export function useGoal(id: string) {
  return useQuery({
    queryKey: ['goals', id],
    queryFn: () => goalsApi.getById(id),
    enabled: !!id,
  });
}

export function useGoalStats(id: string) {
  return useQuery({
    queryKey: ['goals', id, 'stats'],
    queryFn: () => goalsApi.getStats(id),
    enabled: !!id,
  });
}

export function useGoalLogs(id: string, limit = 30) {
  return useQuery({
    queryKey: ['goals', id, 'logs', limit],
    queryFn: () => goalsApi.getLogs(id, limit),
    enabled: !!id,
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateGoalRequest) => goalsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGoalRequest }) =>
      goalsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goals', id] });
      queryClient.invalidateQueries({ queryKey: ['weeklySummary'] });
    },
  });
}

export function useLogGoalProgress() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateGoalLogRequest }) =>
      goalsApi.logProgress(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goals', id] });
      queryClient.invalidateQueries({ queryKey: ['weeklySummary'] });
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => goalsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
  });
}
