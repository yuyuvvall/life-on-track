import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/api/client';
import type { CreateTaskRequest, UpdateTaskRequest, CreateSubTaskRequest, UpdateSubTaskRequest } from '@/types';

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: tasksApi.getAll,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => tasksApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateTaskRequest) => tasksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskRequest }) =>
      tasksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useAddSubTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateSubTaskRequest) => tasksApi.addSubTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateSubTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ taskId, subTaskId, data }: { taskId: string; subTaskId: string; data: UpdateSubTaskRequest }) =>
      tasksApi.updateSubTask(taskId, subTaskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteSubTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ taskId, subTaskId }: { taskId: string; subTaskId: string }) =>
      tasksApi.deleteSubTask(taskId, subTaskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

