import { useState, useEffect } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useCreateExpense, useCreateTask, useAddSubTask } from '@/hooks'
import { EXPENSE_CATEGORIES, type TaskCategory } from '@/types'
import './quick-add-modal.less'

const QuickAddModal = () => {
  const { quickAdd, closeQuickAdd } = useUIStore()
  const createExpense = useCreateExpense()
  const createTask = useCreateTask()
  const addSubTask = useAddSubTask()

  const [amount, setAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState<string>(EXPENSE_CATEGORIES[0])

  const [taskTitle, setTaskTitle] = useState('')
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('Personal')
  const [taskDeadline, setTaskDeadline] = useState('')
  const [subtasks, setSubtasks] = useState<string[]>([])
  const [newSubtask, setNewSubtask] = useState('')

  useEffect(() => {
    if (!quickAdd.isOpen) {
      setAmount('')
      setExpenseCategory(EXPENSE_CATEGORIES[0])
      setTaskTitle('')
      setTaskCategory('Personal')
      setTaskDeadline('')
      setSubtasks([])
      setNewSubtask('')
    }
  }, [quickAdd.isOpen])

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return

    createExpense.mutate(
      { amount: parsedAmount, category: expenseCategory },
      { onSuccess: () => closeQuickAdd() }
    )
  }

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskTitle.trim()) return

    createTask.mutate(
      {
        title: taskTitle.trim(),
        category: taskCategory,
        deadline: taskDeadline || undefined,
      },
      {
        onSuccess: async (task) => {
          if (subtasks.length > 0) {
            for (const text of subtasks) {
              if (text.trim()) {
                await addSubTask.mutateAsync({ taskId: task.id, text: text.trim() })
              }
            }
          }
          closeQuickAdd()
        },
      }
    )
  }

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      setSubtasks([...subtasks, newSubtask.trim()])
      setNewSubtask('')
    }
  }

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index))
  }

  const handleSubtaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddSubtask()
    }
  }

  if (!quickAdd.isOpen) return null

  const taskCategoryModifier: Record<TaskCategory, string> = {
    Work: 'quick-add-modal__task-category-btn--active-work',
    Admin: 'quick-add-modal__task-category-btn--active-admin',
    Personal: 'quick-add-modal__task-category-btn--active-personal',
  }

  return (
    <div className="quick-add-modal" onClick={closeQuickAdd}>
      <div className="quick-add-modal__sheet" onClick={(e) => e.stopPropagation()}>
        <div className="quick-add-modal__header">
          <h2 className="quick-add-modal__title">
            {quickAdd.mode === 'expense' ? 'Quick Expense' : 'New Task'}
          </h2>
          <button onClick={closeQuickAdd} className="quick-add-modal__close-btn">
            <svg className="quick-add-modal__close-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {quickAdd.mode === 'expense' ? (
          <form onSubmit={handleExpenseSubmit} className="quick-add-modal__form">
            <div>
              <label className="quick-add-modal__label">Amount</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="quick-add-modal__amount-input"
                autoFocus
              />
            </div>

            <div>
              <label className="quick-add-modal__label">Category</label>
              <div className="quick-add-modal__category-list">
                {EXPENSE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setExpenseCategory(cat)}
                    className={`quick-add-modal__category-btn${
                      expenseCategory === cat ? ' quick-add-modal__category-btn--active' : ''
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={createExpense.isPending}
              className="quick-add-modal__submit-btn btn btn-primary"
            >
              {createExpense.isPending ? 'Adding...' : 'Add Expense'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleTaskSubmit} className="quick-add-modal__form">
            <div>
              <label className="quick-add-modal__label">Task</label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
              />
            </div>

            <div>
              <label className="quick-add-modal__label">Category</label>
              <div className="quick-add-modal__task-category-list">
                {(['Work', 'Admin', 'Personal'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTaskCategory(cat)}
                    className={`quick-add-modal__task-category-btn${
                      taskCategory === cat ? ` ${taskCategoryModifier[cat]}` : ''
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="quick-add-modal__label">Deadline (optional)</label>
              <input
                type="datetime-local"
                value={taskDeadline}
                onChange={(e) => setTaskDeadline(e.target.value)}
              />
            </div>

            <div>
              <label className="quick-add-modal__label">
                Subtasks ({subtasks.length})
              </label>

              {subtasks.length > 0 && (
                <div className="quick-add-modal__subtask-list">
                  {subtasks.map((st, index) => (
                    <div key={index} className="quick-add-modal__subtask-item">
                      <span className="quick-add-modal__subtask-number">{index + 1}.</span>
                      <span className="quick-add-modal__subtask-text">{st}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubtask(index)}
                        className="quick-add-modal__subtask-remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="quick-add-modal__subtask-form">
                <input
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={handleSubtaskKeyDown}
                  placeholder="Add a subtask..."
                  style={{ flex: 1, fontSize: '0.875em' }}
                />
                <button
                  type="button"
                  onClick={handleAddSubtask}
                  disabled={!newSubtask.trim()}
                  className="btn btn-ghost"
                  style={{ fontSize: '0.875em' }}
                >
                  Add
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={createTask.isPending || addSubTask.isPending}
              className="quick-add-modal__submit-btn btn btn-primary"
            >
              {createTask.isPending || addSubTask.isPending ? 'Adding...' : 'Add Task'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default QuickAddModal
