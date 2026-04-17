import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { goalsApi } from '@/api/client';
import type { Goal, GoalLog, GoalStats, CreateGoalRequest, UpdateGoalRequest, CreateGoalLogRequest, UpdateGoalLogRequest } from '@/types';
import { useOptimisticMutation } from './useOptimisticMutation';

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

const TEMP_LOG_ID = -1;

export function useLogGoalProgress() {
  return useOptimisticMutation<
    { log: GoalLog; goal: Goal },
    { id: string; data: CreateGoalLogRequest }
  >({
    mutationFn: ({ id, data }) => goalsApi.logProgress(id, data, 'Log goal progress'),
    queryKeys: [['goals']],
    optimisticUpdate: (qc, { id, data }) => {
      const patchGoal = (g: Goal): Goal => {
        if (g.id !== id) return g;
        if (g.goalType === 'reading') {
          return { ...g, currentPage: g.currentPage + data.value };
        }
        return { ...g, currentValue: g.currentValue + data.value };
      };
      qc.setQueryData<Goal[]>(['goals'], (old) => old?.map(patchGoal));
      qc.setQueryData<Goal>(['goals', id], (old) => (old ? patchGoal(old) : old));

      const tempLog: GoalLog = {
        id: TEMP_LOG_ID,
        goalId: id,
        logDate: data.logDate || new Date().toISOString().split('T')[0],
        value: data.value,
        note: data.note ?? null,
        createdAt: new Date().toISOString(),
      };
      qc.setQueriesData<GoalLog[]>(
        { queryKey: ['goals', id, 'logs'] },
        (old) => (old ? [tempLog, ...old] : old),
      );

      qc.setQueryData<GoalStats>(['goals', id, 'stats'], (old) => {
        if (!old) return old;
        return {
          ...old,
          goal: patchGoal(old.goal),
          logs: [tempLog, ...old.logs],
          periodProgress: old.periodProgress
            ? {
                ...old.periodProgress,
                current: old.periodProgress.current + data.value,
              }
            : old.periodProgress,
        };
      });
    },
    onServerSuccess: (qc, { log, goal }, { id }) => {
      qc.setQueryData<Goal[]>(['goals'], (old) =>
        old?.map((g) => (g.id === goal.id ? goal : g)),
      );
      qc.setQueryData<Goal>(['goals', goal.id], goal);
      qc.setQueriesData<GoalLog[]>(
        { queryKey: ['goals', goal.id, 'logs'] },
        (old) => (old ? [log, ...old.filter((l) => l.id !== TEMP_LOG_ID)] : old),
      );
      qc.setQueryData<GoalStats>(['goals', id, 'stats'], (old) => {
        if (!old) return old;
        return {
          ...old,
          goal,
          logs: [log, ...old.logs.filter((l) => l.id !== TEMP_LOG_ID)],
        };
      });
      qc.invalidateQueries({ queryKey: ['goals', id, 'stats'] });
    },
    invalidateOnSettled: [['weeklySummary']],
    errorMessage: 'Could not log progress',
  });
}

export function useUpdateGoalLog() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ goalId, logId, data }: { goalId: string; logId: number; data: UpdateGoalLogRequest }) =>
      goalsApi.updateLog(goalId, logId, data, 'Update goal log'),
    onSuccess: (_, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goals', goalId] });
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
