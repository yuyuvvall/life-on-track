import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from '@/api/client';
import { showToast } from '@/store/toastStore';
import type { Category, CreateCategoryRequest, UpdateCategoryRequest } from '@/types';

export function useCategories(includeArchived = false, purpose = 'Load categories') {
  return useQuery({
    queryKey: ['categories', { includeArchived }],
    queryFn: () => categoriesApi.getAll(includeArchived, purpose),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCategoryWithDependents(id: number | undefined) {
  return useQuery({
    queryKey: ['categories', 'detail', id],
    queryFn: () => categoriesApi.getById(id!, 'Load category with dependents'),
    enabled: id !== undefined,
  });
}

/**
 * Convenience: returns a Map keyed by category id for O(1) lookups when
 * rendering an expense's icon/color/name from its `categoryId`.
 */
export function useCategoriesById(includeArchived = false) {
  const { data, ...rest } = useCategories(includeArchived);
  const map = useMemo(() => {
    const m = new Map<number, Category>();
    (data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [data]);
  return { data, byId: map, ...rest };
}

const invalidateCategoryDownstream = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['categories'] });
  // Renames and archives can ripple into anything that displays a category name.
  qc.invalidateQueries({ queryKey: ['expenses'] });
  qc.invalidateQueries({ queryKey: ['recurringExpenses'] });
  qc.invalidateQueries({ queryKey: ['budgets'] });
  qc.invalidateQueries({ queryKey: ['tags'] });
  qc.invalidateQueries({ queryKey: ['weeklySummary'] });
};

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCategoryRequest) => categoriesApi.create(data, 'Create category'),
    onSuccess: () => invalidateCategoryDownstream(qc),
    onError: (err: Error) => {
      showToast({ message: err.message || 'Could not create category', variant: 'error' });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCategoryRequest }) =>
      categoriesApi.update(id, data, 'Update category'),
    onSuccess: () => invalidateCategoryDownstream(qc),
    onError: (err: Error) => {
      showToast({ message: err.message || 'Could not update category', variant: 'error' });
    },
  });
}

export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => categoriesApi.delete(id, 'Archive category'),
    onSuccess: () => invalidateCategoryDownstream(qc),
    onError: (err: Error) => {
      showToast({ message: err.message || 'Could not archive category', variant: 'error' });
    },
  });
}
