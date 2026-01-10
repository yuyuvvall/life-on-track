import { useState } from 'react';
import type { Task, TaskCategory } from '@/types';
import { useUpdateTask } from '@/hooks';

interface TaskEditModalProps {
  task: Task;
  onClose: () => void;
}

const CATEGORIES: TaskCategory[] = ['Work', 'Admin', 'Personal'];

export function TaskEditModal({ task, onClose }: TaskEditModalProps) {
  const updateTask = useUpdateTask();
  
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [deadline, setDeadline] = useState(
    task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : ''
  );
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);

    try {
      await updateTask.mutateAsync({
        id: task.id,
        data: {
          title: title.trim(),
          category,
          deadline: deadline || undefined,
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-surface-800 w-full max-w-md rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-100 mb-4">Edit Task</h2>

        {error && (
          <div className="bg-accent-red/20 border border-accent-red/50 rounded-lg p-3 mb-4 text-sm text-accent-red">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Task Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              className="w-full"
              autoFocus
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">Category</label>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`py-2 rounded-lg text-sm transition-colors
                    ${category === cat 
                      ? cat === 'Work' ? 'bg-blue-600 text-white'
                        : cat === 'Admin' ? 'bg-purple-600 text-white'
                        : 'bg-teal-600 text-white'
                      : 'bg-surface-600 text-gray-300 hover:bg-surface-500'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Deadline (optional)</label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || updateTask.isPending}
              className="btn btn-primary flex-1"
            >
              {updateTask.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

