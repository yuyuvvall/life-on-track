import { useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useCreateExpense, useCreateTask, useAddSubTask } from '@/hooks';
import { EXPENSE_CATEGORIES, type TaskCategory } from '@/types';

export function QuickAddModal() {
  const { quickAdd, closeQuickAdd } = useUIStore();
  const createExpense = useCreateExpense();
  const createTask = useCreateTask();
  const addSubTask = useAddSubTask();

  // Expense form state
  const [amount, setAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<string>(EXPENSE_CATEGORIES[0]);

  // Task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('Personal');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState('');

  // Reset form on close
  useEffect(() => {
    if (!quickAdd.isOpen) {
      setAmount('');
      setExpenseCategory(EXPENSE_CATEGORIES[0]);
      setTaskTitle('');
      setTaskCategory('Personal');
      setTaskDeadline('');
      setSubtasks([]);
      setNewSubtask('');
    }
  }, [quickAdd.isOpen]);

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    createExpense.mutate(
      { amount: parsedAmount, category: expenseCategory },
      { onSuccess: () => closeQuickAdd() }
    );
  };

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    // Create the task first
    createTask.mutate(
      { 
        title: taskTitle.trim(), 
        category: taskCategory,
        deadline: taskDeadline || undefined,
      },
      { 
        onSuccess: async (task) => {
          // Add subtasks if any
          if (subtasks.length > 0) {
            for (const text of subtasks) {
              if (text.trim()) {
                await addSubTask.mutateAsync({ taskId: task.id, text: text.trim() });
              }
            }
          }
          closeQuickAdd();
        }
      }
    );
  };

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      setSubtasks([...subtasks, newSubtask.trim()]);
      setNewSubtask('');
    }
  };

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  const handleSubtaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSubtask();
    }
  };

  if (!quickAdd.isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-end justify-center z-50"
      onClick={closeQuickAdd}
    >
      <div 
        className="bg-surface-800 w-full max-w-md rounded-t-2xl p-4 pb-8 animate-slide-up max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">
            {quickAdd.mode === 'expense' ? 'Quick Expense' : 'New Task'}
          </h2>
          <button onClick={closeQuickAdd} className="text-gray-500 hover:text-gray-300">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {quickAdd.mode === 'expense' ? (
          /* Expense Form */
          <form onSubmit={handleExpenseSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Amount</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-2xl font-mono"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <div className="flex flex-wrap gap-2">
                {EXPENSE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setExpenseCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors
                      ${expenseCategory === cat 
                        ? 'bg-accent-blue text-white' 
                        : 'bg-surface-600 text-gray-300 hover:bg-surface-500'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={createExpense.isPending}
              className="w-full btn btn-primary py-3 text-base"
            >
              {createExpense.isPending ? 'Adding...' : 'Add Expense'}
            </button>
          </form>
        ) : (
          /* Task Form */
          <form onSubmit={handleTaskSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Task</label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <div className="flex gap-2">
                {(['Work', 'Admin', 'Personal'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTaskCategory(cat)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors
                      ${taskCategory === cat 
                        ? cat === 'Work' ? 'bg-blue-500/30 text-blue-400 ring-1 ring-blue-500' :
                          cat === 'Admin' ? 'bg-purple-500/30 text-purple-400 ring-1 ring-purple-500' :
                          'bg-emerald-500/30 text-emerald-400 ring-1 ring-emerald-500'
                        : 'bg-surface-600 text-gray-300 hover:bg-surface-500'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Deadline (optional)</label>
              <input
                type="datetime-local"
                value={taskDeadline}
                onChange={(e) => setTaskDeadline(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Subtasks Section */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Subtasks ({subtasks.length})
              </label>
              
              {/* Existing subtasks */}
              {subtasks.length > 0 && (
                <div className="space-y-1 mb-2">
                  {subtasks.map((st, index) => (
                    <div key={index} className="flex items-center gap-2 bg-surface-700 rounded px-2 py-1.5">
                      <span className="text-xs text-gray-500">{index + 1}.</span>
                      <span className="flex-1 text-sm text-gray-300">{st}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubtask(index)}
                        className="text-gray-600 hover:text-accent-red text-sm"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add subtask input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={handleSubtaskKeyDown}
                  placeholder="Add a subtask..."
                  className="flex-1 text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddSubtask}
                  disabled={!newSubtask.trim()}
                  className="btn btn-ghost text-sm px-3"
                >
                  Add
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={createTask.isPending || addSubTask.isPending}
              className="w-full btn btn-primary py-3 text-base"
            >
              {createTask.isPending || addSubTask.isPending ? 'Adding...' : 'Add Task'}
            </button>
          </form>
        )}
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
