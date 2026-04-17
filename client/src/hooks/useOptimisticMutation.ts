import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';
import { showToast } from '@/store/toastStore';

type CacheSnapshot = Array<[QueryKey, unknown]>;

interface MutationContext {
  snapshots: CacheSnapshot;
}

export interface UseOptimisticMutationOptions<TData, TVars> {
  mutationFn: (vars: TVars) => Promise<TData>;
  /**
   * Query keys whose caches will be snapshotted before the optimistic update
   * and restored on error. Prefix-matches via React Query predicate, so
   * `['expenses']` also covers `['expenses', 'range', ...]`.
   */
  queryKeys: QueryKey[];
  /**
   * Apply the optimistic update. Directly mutate cache via `qc.setQueryData`.
   * Called inside onMutate, after in-flight queries are cancelled.
   */
  optimisticUpdate: (qc: QueryClient, vars: TVars) => void;
  /**
   * Reconcile with the server response — e.g. swap a temp id for the real id.
   * Called inside onSuccess, before invalidations.
   */
  onServerSuccess?: (qc: QueryClient, data: TData, vars: TVars) => void;
  /**
   * Query keys to invalidate once the mutation settles. Use this for
   * cross-cutting caches (like `['weeklySummary']`) that the optimistic
   * update can't derive. Happens in the background — does not block the UI.
   */
  invalidateOnSettled?: QueryKey[];
  /** Toast text shown on rollback. */
  errorMessage: string;
  /** Extra react-query options (retry, etc). */
  options?: Omit<
    UseMutationOptions<TData, Error, TVars, MutationContext>,
    'mutationFn' | 'onMutate' | 'onError' | 'onSuccess' | 'onSettled'
  >;
}

export function useOptimisticMutation<TData, TVars>({
  mutationFn,
  queryKeys,
  optimisticUpdate,
  onServerSuccess,
  invalidateOnSettled,
  errorMessage,
  options,
}: UseOptimisticMutationOptions<TData, TVars>): UseMutationResult<
  TData,
  Error,
  TVars,
  MutationContext
> {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVars, MutationContext>({
    ...options,
    mutationFn,
    onMutate: async (vars) => {
      await Promise.all(
        queryKeys.map((key) => queryClient.cancelQueries({ queryKey: key })),
      );

      const seen = new Set<string>();
      const snapshots: CacheSnapshot = [];
      for (const key of queryKeys) {
        const entries = queryClient.getQueriesData({ queryKey: key });
        for (const [entryKey, data] of entries) {
          const serialized = JSON.stringify(entryKey);
          if (seen.has(serialized)) continue;
          seen.add(serialized);
          snapshots.push([entryKey, data]);
        }
      }

      optimisticUpdate(queryClient, vars);

      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      if (context) {
        for (const [key, data] of context.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      showToast({ message: errorMessage, variant: 'error' });
    },
    onSuccess: (data, vars) => {
      onServerSuccess?.(queryClient, data, vars);
    },
    onSettled: () => {
      if (invalidateOnSettled) {
        for (const key of invalidateOnSettled) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
    },
  });
}
