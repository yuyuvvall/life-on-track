import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/api/client';
import type { CreateTaskRequest, UpdateTaskRequest, CreateSubTaskRequest, UpdateSubTaskRequest } from '@/types';

export function useTasks(purpose = 'Load tasks list') {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => tasksApi.getAll(purpose),
  });
}

export function useTask(id: string, purpose = 'View task details') {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => tasksApi.getById(id, purpose),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateTaskRequest) => tasksApi.create(data, 'Create new task'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTaskRequest }) =>
      tasksApi.update(id, data, 'Update task'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => tasksApi.delete(id, 'Delete task'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useAddSubTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: CreateSubTaskRequest) => tasksApi.addSubTask(data, 'Add subtask'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateSubTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ taskId, subTaskId, data }: { taskId: string; subTaskId: string; data: UpdateSubTaskRequest }) =>
      tasksApi.updateSubTask(taskId, subTaskId, data, 'Update subtask'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteSubTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ taskId, subTaskId }: { taskId: string; subTaskId: string }) =>
      tasksApi.deleteSubTask(taskId, subTaskId, 'Delete subtask'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
