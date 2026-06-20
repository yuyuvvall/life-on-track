import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cardsApi } from '@/api/client';
import type {
  CreateCardRequest,
  UpdateCardRequest,
  CreateCardLoadRequest,
} from '@/types';

// Queries

export function useCards(includeArchived = false, purpose = 'Load prepaid cards') {
  return useQuery({
    queryKey: ['cards', { includeArchived }],
    queryFn: () => cardsApi.getAll(includeArchived, purpose),
  });
}

export function useCard(id: number | undefined, purpose = 'Load card details') {
  return useQuery({
    queryKey: ['cards', id],
    queryFn: () => cardsApi.getById(id!, purpose),
    enabled: id !== undefined,
  });
}

export function useCardLoads(cardId: number | undefined, purpose = 'Load card loads') {
  return useQuery({
    queryKey: ['cards', cardId, 'loads'],
    queryFn: () => cardsApi.getLoads(cardId!, purpose),
    enabled: cardId !== undefined,
  });
}

export function useCardActivity(cardId: number | undefined, purpose = 'Load card activity') {
  return useQuery({
    queryKey: ['cards', cardId, 'activity'],
    queryFn: () => cardsApi.getActivity(cardId!, purpose),
    enabled: cardId !== undefined,
  });
}

// Mutations

export function useCreateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCardRequest) => cardsApi.create(data, 'Create card'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards'] }),
  });
}

export function useUpdateCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCardRequest }) =>
      cardsApi.update(id, data, 'Update card'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards'] }),
  });
}

export function useDeleteCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => cardsApi.delete(id, 'Archive card'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards'] }),
  });
}

export function useCreateCardLoad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, data }: { cardId: number; data: CreateCardLoadRequest }) =>
      cardsApi.createLoad(cardId, data, 'Load card'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards'] }),
  });
}

export function useDeleteCardLoad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, loadId }: { cardId: number; loadId: number }) =>
      cardsApi.deleteLoad(cardId, loadId, 'Delete load'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cards'] }),
  });
}
