import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetsApi } from '@/api/client';
import type { UpsertBudgetRequest } from '@/types';

export function useBudgetsByMonth(month: string, purpose = 'View budgets') {
  return useQuery({
    queryKey: ['budgets', month],
    queryFn: () => budgetsApi.getByMonth(month, purpose),
    enabled: !!month,
  });
}

export function useUpsertBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpsertBudgetRequest) => budgetsApi.upsert(data, 'Set budget'),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['budgets', vars.month] });
    },
  });
}

export function useDeleteBudget(month: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => budgetsApi.delete(id, 'Delete budget'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', month] });
    },
  });
}

export function useChangeBudgetFromNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpsertBudgetRequest) => budgetsApi.changeFromNow(data, 'Change budget from now on'),
    onSuccess: () => {
      // Any cached month view could have been affected (this month + all later months).
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}

export function useRemoveBudgetEntirely() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ category, month }: { category: string; month: string }) =>
      budgetsApi.removeEntirely(category, month, 'Remove budget entirely'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
    },
  });
}
