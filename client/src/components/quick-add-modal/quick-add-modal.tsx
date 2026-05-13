import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useUIStore } from '@/store/uiStore'
import { useCreateExpense } from '@/hooks'
import { useCategories } from '@/hooks/useCategories'
import { tasksApi } from '@/api/client'
import { optimisticId } from '@/utils/optimisticId'
import { showToast } from '@/store/toastStore'
import type { TaskCategory, Task } from '@/types'
import './quick-add-modal.less'

const QuickAddModal = () => {
  const { quickAdd, closeQuickAdd } = useUIStore()
  const queryClient = useQueryClient()
  const createExpense = useCreateExpense()
  const { data: categories = [] } = useCategories()

  const [amount, setAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState<string>('Food')

  const [taskTitle, setTaskTitle] = useState('')
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('Personal')
  const [taskDeadline, setTaskDeadline] = useState('')
  const [subtasks, setSubtasks] = useState<string[]>([])
  const [newSubtask, setNewSubtask] = useState('')

  // Depend on the primitive default rather than the `categories` array — while
  // useCategories() is still loading, the `= []` destructure default creates a
  // fresh array each render, which combined with `setSubtasks([])` (also a new
  // reference each call) drove an infinite re-render loop.
  const defaultExpenseCategory = categories[0]?.name ?? 'Food'
  useEffect(() => {
    if (!quickAdd.isOpen) {
      setAmount('')
      setExpenseCategory(defaultExpenseCategory)
      setTaskTitle('')
      setTaskCategory('Personal')
      setTaskDeadline('')
      setSubtasks([])
      setNewSubtask('')
    }
  }, [quickAdd.isOpen, defaultExpenseCategory])

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return

    createExpense.mutate(
      { amount: parsedAmount, category: expenseCategory },
      { onSuccess: () => closeQuickAdd() }
    )
  }

  const handleTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const title = taskTitle.trim()
    if (!title) return

    const cleanSubtasks = subtasks.map((t) => t.trim()).filter(Boolean)
    const tempTaskId = optimisticId()
    const tempTask: Task = {
      id: tempTaskId,
      parentId: null,
      title,
      subTasks: cleanSubtasks.map((text) => ({
        id: optimisticId(),
        text,
        completed: false,
      })),
      category: taskCategory,
      deadline: taskDeadline || null,
      scheduledCompleteDate: null,
      isCompleted: false,
      createdAt: new Date().toISOString(),
    }

    queryClient.setQueryData<Task[]>(['tasks'], (old) =>
      old ? [tempTask, ...old] : [tempTask],
    )

    closeQuickAdd()

    ;(async () => {
      try {
        const serverTask = await tasksApi.create(
          {
            title,
            category: taskCategory,
            deadline: taskDeadline || undefined,
          },
          'Create new task',
        )

        queryClient.setQueryData<Task[]>(['tasks'], (old) =>
          old?.map((t) =>
            t.id === tempTaskId
              ? { ...serverTask, subTasks: tempTask.subTasks }
              : t,
          ),
        )

        if (cleanSubtasks.length > 0) {
          await Promise.all(
            cleanSubtasks.map((text) =>
              tasksApi.addSubTask(
                { taskId: serverTask.id, text },
                'Add subtask',
              ),
            ),
          )
        }

        queryClient.invalidateQueries({ queryKey: ['tasks'] })
      } catch {
        queryClient.setQueryData<Task[]>(['tasks'], (old) =>
          old?.filter((t) => t.id !== tempTaskId),
        )
        queryClient.invalidateQueries({ queryKey: ['tasks'] })
        showToast({ message: 'Could not create task', variant: 'error' })
      }
    })()
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
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setExpenseCategory(cat.name)}
                    className={`quick-add-modal__category-btn${
                      expenseCategory === cat.name ? ' quick-add-modal__category-btn--active' : ''
                    }`}
                  >
                    {cat.name}
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
              className="quick-add-modal__submit-btn btn btn-primary"
            >
              Add Task
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default QuickAddModal
