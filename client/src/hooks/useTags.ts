import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tagsApi } from '@/api/client';
import type { CreateTagRequest, UpdateTagRequest } from '@/types';
import { showToast } from '@/store/toastStore';

export function useTags(includeArchived = false, purpose = 'Load tags') {
  return useQuery({
    queryKey: ['tags', { includeArchived }],
    queryFn: () => tagsApi.getAll(includeArchived, purpose),
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTagRequest) => tagsApi.create(data, 'Create tag'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: () => {
      showToast({ message: 'Could not create tag', variant: 'error' });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateTagRequest }) =>
      tagsApi.update(id, data, 'Update tag'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: () => {
      showToast({ message: 'Could not update tag', variant: 'error' });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tagsApi.delete(id, 'Archive tag'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: () => {
      showToast({ message: 'Could not archive tag', variant: 'error' });
    },
  });
}
