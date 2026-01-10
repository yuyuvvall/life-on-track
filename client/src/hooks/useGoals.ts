import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { goalsApi } from '@/api/client';
import type { CreateGoalRequest, UpdateGoalRequest, CreateGoalLogRequest } from '@/types';

export function useGoals(purpose = 'Load goals list') {
  return useQuery({
    queryKey: ['goals'],
    queryFn: () => goalsApi.getAll(purpose),
  });
}

export function useGoal(id: string, purpose = 'View goal') {
  return useQuery({
    queryKey: ['goals', id],
    queryFn: () => goalsApi.getById(id, purpose),
    enabled: !!id,
  });
}

export function useGoalStats(id: string, purpose = 'View goal details') {
  return useQuery({
    queryKey: ['goals', id, 'stats'],
    queryFn: () => goalsApi.getStats(id, purpose),
    enabled: !!id,
  });
}

export function useGoalLogs(id: string, limit = 30, purpose = 'View goal progress history') {
  return useQuery({
    queryKey: ['goals', id, 'logs', limit],
    queryFn: () => goalsApi.getLogs(id, limit, purpose),
    enabled: !!id,
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateGoalRequest) => goalsApi.create(data, 'Create new goal'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGoalRequest }) =>
      goalsApi.update(id, data, 'Update goal'),
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
      goalsApi.logProgress(id, data, 'Log goal progress'),
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
    mutationFn: (id: string) => goalsApi.delete(id, 'Archive goal'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
    },
  });
}
