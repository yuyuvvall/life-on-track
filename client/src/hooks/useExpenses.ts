import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi } from '@/api/client';
import type { CreateExpenseRequest } from '@/types';

export function useExpenses() {
  return useQuery({
    queryKey: ['expenses'],
    queryFn: expensesApi.getAll,
  });
}

export function useExpensesByDateRange(start: string, end: string) {
  return useQuery({
    queryKey: ['expenses', 'range', start, end],
    queryFn: () => expensesApi.getByDateRange(start, end),
    enabled: !!start && !!end,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateExpenseRequest) => expensesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['weeklySummary'] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => expensesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['weeklySummary'] });
    },
  });
}

