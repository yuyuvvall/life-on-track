import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { expensesApi, recurringExpensesApi } from '@/api/client';
import type { 
  CreateExpenseRequest, 
  UpdateExpenseRequest,
  CreateRecurringExpenseRequest,
  UpdateRecurringExpenseRequest,
} from '@/types';

// Regular Expenses Hooks

export function useExpenses(purpose = 'Load all expenses') {
  return useQuery({
    queryKey: ['expenses'],
    queryFn: () => expensesApi.getAll(purpose),
  });
}

export function useExpense(id: number | undefined, purpose = 'Load expense details') {
  return useQuery({
    queryKey: ['expenses', id],
    queryFn: () => expensesApi.getById(id!, purpose),
    enabled: id !== undefined,
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

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateExpenseRequest }) => 
      expensesApi.update(id, data, 'Update expense'),
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

// Recurring Expenses Hooks

export function useRecurringExpenses(purpose = 'Load recurring expenses') {
  return useQuery({
    queryKey: ['recurringExpenses'],
    queryFn: () => recurringExpensesApi.getAll(purpose),
  });
}

export function useCreateRecurringExpense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateRecurringExpenseRequest) => 
      recurringExpensesApi.create(data, 'Create recurring expense'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringExpenses'] });
    },
  });
}

export function useUpdateRecurringExpense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateRecurringExpenseRequest }) => 
      recurringExpensesApi.update(id, data, 'Update recurring expense'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringExpenses'] });
    },
  });
}

export function useDeleteRecurringExpense() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: number) => recurringExpensesApi.delete(id, 'Delete recurring expense'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringExpenses'] });
    },
  });
}

export function useGenerateRecurringExpenses() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => recurringExpensesApi.generate('Generate recurring expenses'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['weeklySummary'] });
    },
  });
}
