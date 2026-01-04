import { useMemo } from 'react';
import { TaskCard } from './TaskCard';
import { useTasks, useDeleteTask } from '@/hooks';
import type { Task } from '@/types';

export function FocusList() {
  const { data: tasks, isLoading } = useTasks();
  const deleteTask = useDeleteTask();

  // Sort tasks: incomplete first, then by deadline (urgent first), then by created
  const sortedTasks = useMemo(() => {
    if (!tasks) return [];
    
    const now = Date.now();
    const twoDaysFromNow = now + 2 * 24 * 60 * 60 * 1000;

    return [...tasks]
      .filter(t => !t.isCompleted)
      .sort((a, b) => {
        // Both have deadlines
        if (a.deadline && b.deadline) {
          const aDate = new Date(a.deadline).getTime();
          const bDate = new Date(b.deadline).getTime();
          
          // Urgent tasks (within 2 days) come first
          const aUrgent = aDate <= twoDaysFromNow;
          const bUrgent = bDate <= twoDaysFromNow;
          
          if (aUrgent && !bUrgent) return -1;
          if (!aUrgent && bUrgent) return 1;
          
          return aDate - bDate;
        }
        
        // Tasks with deadlines come before tasks without
        if (a.deadline && !b.deadline) return -1;
        if (!a.deadline && b.deadline) return 1;
        
        // Fall back to created date
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [tasks]);

  const completedTasks = useMemo(() => {
    return tasks?.filter(t => t.isCompleted) || [];
  }, [tasks]);

  const handleDelete = (id: string) => {
    deleteTask.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface-700 rounded-lg h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  if (sortedTasks.length === 0 && completedTasks.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 text-sm">No tasks yet</div>
        <div className="text-gray-600 text-xs mt-1">
          Long press the + button to add a task
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Active tasks */}
      {sortedTasks.map((task: Task) => (
        <TaskCard 
          key={task.id} 
          task={task} 
          onDelete={handleDelete}
        />
      ))}

      {/* Completed tasks */}
      {completedTasks.length > 0 && (
        <div className="mt-6">
          <div className="text-xs text-gray-600 uppercase tracking-wider mb-2 px-1">
            Completed ({completedTasks.length})
          </div>
          <div className="space-y-2 opacity-60">
            {completedTasks.slice(0, 5).map((task: Task) => (
              <TaskCard 
                key={task.id} 
                task={task} 
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

