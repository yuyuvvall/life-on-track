import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi } from '@/api/client';
import type { CreateExpenseRequest } from '@/types';

export function useExpenses(purpose = 'Load all expenses') {
  return useQuery({
    queryKey: ['expenses'],
    queryFn: () => expensesApi.getAll(purpose),
  });
}

export function useExpensesByDateRange(start: string, end: string, purpose = 'View expenses list') {
  return useQuery({
    queryKey: ['expenses', 'range', start, end],
    queryFn: () => expensesApi.getByDateRange(start, end, purpose),
    enabled: !!start && !!end,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateExpenseRequest) => expensesApi.create(data, 'Add expense'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['weeklySummary'] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => expensesApi.delete(id, 'Delete expense'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['weeklySummary'] });
    },
  });
}
