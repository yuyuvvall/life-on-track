import { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import type { Task } from '@/types';
import { useUpdateTask, useUpdateSubTask, useAddSubTask, useDeleteSubTask } from '@/hooks';
import { TaskEditModal } from './TaskEditModal';

interface TaskCardProps {
  task: Task;
  onDelete?: (id: string) => void;
}

export function TaskCard({ task, onDelete }: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newSubTaskText, setNewSubTaskText] = useState('');
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editingSubTaskId, setEditingSubTaskId] = useState<string | null>(null);
  const [editingSubTaskText, setEditingSubTaskText] = useState('');
  
  const updateTask = useUpdateTask();
  const updateSubTask = useUpdateSubTask();
  const addSubTask = useAddSubTask();
  const deleteSubTask = useDeleteSubTask();

  // Parent-child logic: can only complete if all subtasks are done
  const canComplete = task.subTasks.length === 0 || 
                      task.subTasks.every(s => s.completed);
  
  const completedCount = task.subTasks.filter(s => s.completed).length;
  const isUrgent = task.deadline && !task.isCompleted && 
    new Date(task.deadline) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

  const handleComplete = () => {
    if (!canComplete) return;
    updateTask.mutate({ id: task.id, data: { isCompleted: !task.isCompleted } });
  };

  const handleSubTaskToggle = (subTaskId: string, completed: boolean) => {
    updateSubTask.mutate({ 
      taskId: task.id, 
      subTaskId, 
      data: { completed: !completed } 
    });
  };

  const handleAddSubTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubTaskText.trim()) return;
    addSubTask.mutate({ taskId: task.id, text: newSubTaskText.trim() });
    setNewSubTaskText('');
  };

  const handleDeleteSubTask = (subTaskId: string) => {
    deleteSubTask.mutate({ taskId: task.id, subTaskId });
  };

  const startEditingSubTask = (subTaskId: string, currentText: string) => {
    setEditingSubTaskId(subTaskId);
    setEditingSubTaskText(currentText);
  };

  const saveSubTaskEdit = () => {
    if (!editingSubTaskId || !editingSubTaskText.trim()) {
      setEditingSubTaskId(null);
      return;
    }
    updateSubTask.mutate({ 
      taskId: task.id, 
      subTaskId: editingSubTaskId, 
      data: { text: editingSubTaskText.trim() } 
    });
    setEditingSubTaskId(null);
    setEditingSubTaskText('');
  };

  const handleSubTaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveSubTaskEdit();
    } else if (e.key === 'Escape') {
      setEditingSubTaskId(null);
      setEditingSubTaskText('');
    }
  };

  // Swipe handlers
  const swipeHandlers = useSwipeable({
    onSwiping: (e) => {
      if (e.dir === 'Right' && canComplete) {
        setSwipeOffset(Math.min(e.deltaX, 100));
      }
    },
    onSwipedRight: () => {
      if (swipeOffset > 60 && canComplete) {
        handleComplete();
      }
      setSwipeOffset(0);
    },
    onSwiped: () => setSwipeOffset(0),
    trackMouse: false,
    trackTouch: true,
  });

  const categoryClass = {
    Work: 'badge-work',
    Admin: 'badge-admin',
    Personal: 'badge-personal',
  }[task.category];

  return (
    <>
      <div 
        className={`relative overflow-hidden rounded-lg ${isUrgent ? 'task-urgent' : ''}`}
        {...swipeHandlers}
      >
        {/* Swipe background */}
        <div 
          className="absolute inset-y-0 left-0 bg-accent-green/20 flex items-center pl-4"
          style={{ width: swipeOffset }}
        >
          {swipeOffset > 40 && (
            <svg className="w-6 h-6 text-accent-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* Card content */}
        <div 
          className="relative bg-surface-700 p-3 transition-transform"
          style={{ transform: `translateX(${swipeOffset}px)` }}
        >
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            <button
              onClick={handleComplete}
              disabled={!canComplete}
              className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors
                ${task.isCompleted 
                  ? 'bg-accent-green border-accent-green' 
                  : canComplete 
                    ? 'border-gray-500 hover:border-accent-green' 
                    : 'border-gray-700 cursor-not-allowed'}`}
            >
              {task.isCompleted && (
                <svg className="w-3 h-3 text-surface-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm ${task.isCompleted ? 'text-gray-500 line-through' : 'text-gray-100'}`}>
                  {task.title}
                </span>
                <span className={`badge ${categoryClass}`}>{task.category}</span>
                {task.subTasks.length > 0 && (
                  <span className="text-xs text-gray-500 font-mono">
                    {completedCount}/{task.subTasks.length}
                  </span>
                )}
              </div>

              {/* Deadline */}
              {task.deadline && (
                <div className={`text-xs mt-1 font-mono ${isUrgent ? 'text-accent-amber' : 'text-gray-500'}`}>
                  {new Date(task.deadline).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              )}

              {/* Subtasks toggle */}
              {(task.subTasks.length > 0 || isExpanded) && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-xs text-gray-500 hover:text-gray-300 mt-1"
                >
                  {isExpanded ? '▼ Hide subtasks' : '▶ Show subtasks'}
                </button>
              )}

              {/* Subtasks list */}
              {isExpanded && (
                <div className="mt-2 pl-2 border-l border-surface-500 space-y-1">
                  {task.subTasks.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2 group">
                      <button
                        onClick={() => handleSubTaskToggle(sub.id, sub.completed)}
                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center
                          ${sub.completed 
                            ? 'bg-accent-green/50 border-accent-green/50' 
                            : 'border-gray-600 hover:border-gray-400'}`}
                      >
                        {sub.completed && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      
                      {editingSubTaskId === sub.id ? (
                        <input
                          type="text"
                          value={editingSubTaskText}
                          onChange={(e) => setEditingSubTaskText(e.target.value)}
                          onBlur={saveSubTaskEdit}
                          onKeyDown={handleSubTaskKeyDown}
                          className="flex-1 bg-surface-800 border-surface-600 text-xs px-2 py-0.5"
                          autoFocus
                        />
                      ) : (
                        <span className={`text-xs flex-1 ${sub.completed ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                          {sub.text}
                        </span>
                      )}
                      
                      {/* Subtask edit button */}
                      <button
                        onClick={() => startEditingSubTask(sub.id, sub.text)}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-accent-blue text-xs"
                        title="Edit subtask"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      
                      <button
                        onClick={() => handleDeleteSubTask(sub.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-accent-red text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {/* Add subtask form */}
                  <form onSubmit={handleAddSubTask} className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={newSubTaskText}
                      onChange={(e) => setNewSubTaskText(e.target.value)}
                      placeholder="Add subtask..."
                      className="flex-1 bg-surface-800 border-surface-600 text-xs px-2 py-1"
                    />
                    <button type="submit" className="text-xs text-accent-blue hover:text-blue-400">
                      Add
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Edit button */}
            <button
              onClick={() => setIsEditing(true)}
              className="text-gray-600 hover:text-accent-blue flex-shrink-0"
              title="Edit task"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>

            {/* Delete button */}
            {onDelete && (
              <button
                onClick={() => onDelete(task.id)}
                className="text-gray-600 hover:text-accent-red flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Task Edit Modal */}
      {isEditing && (
        <TaskEditModal task={task} onClose={() => setIsEditing(false)} />
      )}
    </>
  );
}
