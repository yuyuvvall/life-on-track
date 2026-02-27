import { useState } from 'react';
import type { Task, TaskCategory } from '@/types';
import { useUpdateTask } from '@/hooks';
import './task-edit-modal.less';

export type TaskEditModalProps = {
  task: Task;
  onClose: () => void;
};

const CATEGORIES: TaskCategory[] = ['Work', 'Admin', 'Personal'];

const CATEGORY_MODIFIER: Record<TaskCategory, string> = {
  Work: 'task-edit-modal__category-btn--active-work',
  Admin: 'task-edit-modal__category-btn--active-admin',
  Personal: 'task-edit-modal__category-btn--active-personal',
};

const TaskEditModal = ({ task, onClose }: TaskEditModalProps) => {
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
    <div className="task-edit-modal" onClick={onClose}>
      <div
        className="task-edit-modal__card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="task-edit-modal__title">Edit Task</h2>

        {error && <div className="task-edit-modal__error">{error}</div>}

        <form onSubmit={handleSubmit} className="task-edit-modal__form">
          <div>
            <label className="task-edit-modal__label">Task Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              className="task-edit-modal__input"
              autoFocus
            />
          </div>

          <div>
            <label className="task-edit-modal__label task-edit-modal__label--spaced">
              Category
            </label>
            <div className="task-edit-modal__category-grid">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`task-edit-modal__category-btn ${
                    category === cat ? CATEGORY_MODIFIER[cat] : ''
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="task-edit-modal__label">Deadline (optional)</label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="task-edit-modal__input"
            />
          </div>

          <div className="task-edit-modal__actions">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost task-edit-modal__action-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || updateTask.isPending}
              className="btn btn-primary task-edit-modal__action-btn"
            >
              {updateTask.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskEditModal;
