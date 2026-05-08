import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { categoriesApi } from '@/api/client';
import type { Category } from '@/types';

export function useCategories(includeArchived = false, purpose = 'Load categories') {
  return useQuery({
    queryKey: ['categories', { includeArchived }],
    queryFn: () => categoriesApi.getAll(includeArchived, purpose),
    staleTime: 1000 * 60 * 5,
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
