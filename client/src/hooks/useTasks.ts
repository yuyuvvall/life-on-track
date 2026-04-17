import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/api/client';
import type { Task, CreateTaskRequest, UpdateTaskRequest, UpdateSubTaskRequest } from '@/types';
import { optimisticId, isOptimistic } from '@/utils/optimisticId';
import { useOptimisticMutation } from './useOptimisticMutation';

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
  return useOptimisticMutation<Task, { id: string; data: UpdateTaskRequest }>({
    mutationFn: ({ id, data }) => tasksApi.update(id, data, 'Update task'),
    queryKeys: [['tasks']],
    optimisticUpdate: (qc, { id, data }) => {
      qc.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) => (t.id === id ? { ...t, ...data } : t)),
      );
      qc.setQueryData<Task>(['tasks', id], (old) =>
        old ? { ...old, ...data } : old,
      );
    },
    onServerSuccess: (qc, task) => {
      qc.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) => (t.id === task.id ? task : t)),
      );
      qc.setQueryData<Task>(['tasks', task.id], task);
    },
    errorMessage: 'Could not update task',
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
  return useOptimisticMutation<Task, { taskId: string; text: string }>({
    mutationFn: ({ taskId, text }) =>
      tasksApi.addSubTask({ taskId, text }, 'Add subtask'),
    queryKeys: [['tasks']],
    optimisticUpdate: (qc, { taskId, text }) => {
      const tempSubTaskId = optimisticId();
      const patch = (t: Task): Task =>
        t.id === taskId
          ? {
              ...t,
              subTasks: [
                ...t.subTasks,
                { id: tempSubTaskId, text, completed: false },
              ],
            }
          : t;
      qc.setQueryData<Task[]>(['tasks'], (old) => old?.map(patch));
      qc.setQueryData<Task>(['tasks', taskId], (old) => (old ? patch(old) : old));
    },
    onServerSuccess: (qc, task) => {
      const merge = (cached: Task | undefined | null): Task => {
        if (!cached) return task;
        const serverIds = new Set(task.subTasks.map((s) => s.id));
        const pending = cached.subTasks.filter(
          (s) => isOptimistic(s.id) && !serverIds.has(s.id),
        );
        return { ...task, subTasks: [...task.subTasks, ...pending] };
      };
      qc.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) => (t.id === task.id ? merge(t) : t)),
      );
      qc.setQueryData<Task>(['tasks', task.id], (old) => merge(old));
    },
    errorMessage: 'Could not add subtask',
  });
}

export function useUpdateSubTask() {
  return useOptimisticMutation<
    Task,
    { taskId: string; subTaskId: string; data: UpdateSubTaskRequest }
  >({
    mutationFn: ({ taskId, subTaskId, data }) =>
      tasksApi.updateSubTask(taskId, subTaskId, data, 'Update subtask'),
    queryKeys: [['tasks']],
    optimisticUpdate: (qc, { taskId, subTaskId, data }) => {
      const patchTask = (t: Task): Task =>
        t.id === taskId
          ? {
              ...t,
              subTasks: t.subTasks.map((s) =>
                s.id === subTaskId ? { ...s, ...data } : s,
              ),
            }
          : t;
      qc.setQueryData<Task[]>(['tasks'], (old) => old?.map(patchTask));
      qc.setQueryData<Task>(['tasks', taskId], (old) =>
        old ? patchTask(old) : old,
      );
    },
    onServerSuccess: (qc, task) => {
      qc.setQueryData<Task[]>(['tasks'], (old) =>
        old?.map((t) => (t.id === task.id ? task : t)),
      );
      qc.setQueryData<Task>(['tasks', task.id], task);
    },
    errorMessage: 'Could not update subtask',
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
