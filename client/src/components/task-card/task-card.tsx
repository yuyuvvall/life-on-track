import './task-card.less'
import { useState } from 'react'
import { useSwipeable } from 'react-swipeable'
import type { Task } from '@/types'
import { useUpdateTask, useUpdateSubTask, useAddSubTask, useDeleteSubTask } from '@/hooks'
import { TaskEditModal } from '../task-edit-modal'

export type TaskCardProps = {
  task: Task
  onDelete?: (id: string) => void
}

const TaskCard = ({ task, onDelete }: TaskCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [newSubTaskText, setNewSubTaskText] = useState('')
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [editingSubTaskId, setEditingSubTaskId] = useState<string | null>(null)
  const [editingSubTaskText, setEditingSubTaskText] = useState('')

  const updateTask = useUpdateTask()
  const updateSubTask = useUpdateSubTask()
  const addSubTask = useAddSubTask()
  const deleteSubTask = useDeleteSubTask()

  const canComplete =
    task.subTasks.length === 0 || task.subTasks.every((s) => s.completed)

  const completedCount = task.subTasks.filter((s) => s.completed).length
  const isUrgent =
    task.deadline &&
    !task.isCompleted &&
    new Date(task.deadline) <= new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)

  const handleComplete = () => {
    if (!canComplete) return
    updateTask.mutate({ id: task.id, data: { isCompleted: !task.isCompleted } })
  }

  const handleSubTaskToggle = (subTaskId: string, completed: boolean) => {
    updateSubTask.mutate({
      taskId: task.id,
      subTaskId,
      data: { completed: !completed },
    })
  }

  const handleAddSubTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubTaskText.trim()) return
    addSubTask.mutate({ taskId: task.id, text: newSubTaskText.trim() })
    setNewSubTaskText('')
  }

  const handleDeleteSubTask = (subTaskId: string) => {
    deleteSubTask.mutate({ taskId: task.id, subTaskId })
  }

  const startEditingSubTask = (subTaskId: string, currentText: string) => {
    setEditingSubTaskId(subTaskId)
    setEditingSubTaskText(currentText)
  }

  const saveSubTaskEdit = () => {
    if (!editingSubTaskId || !editingSubTaskText.trim()) {
      setEditingSubTaskId(null)
      return
    }
    updateSubTask.mutate({
      taskId: task.id,
      subTaskId: editingSubTaskId,
      data: { text: editingSubTaskText.trim() },
    })
    setEditingSubTaskId(null)
    setEditingSubTaskText('')
  }

  const handleSubTaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveSubTaskEdit()
    } else if (e.key === 'Escape') {
      setEditingSubTaskId(null)
      setEditingSubTaskText('')
    }
  }

  const swipeHandlers = useSwipeable({
    onSwiping: (e) => {
      if (e.dir === 'Right' && canComplete) {
        setSwipeOffset(Math.min(e.deltaX, 100))
      }
    },
    onSwipedRight: () => {
      if (swipeOffset > 60 && canComplete) {
        handleComplete()
      }
      setSwipeOffset(0)
    },
    onSwiped: () => setSwipeOffset(0),
    trackMouse: false,
    trackTouch: true,
  })

  const categoryClass = {
    Work: 'badge-work',
    Admin: 'badge-admin',
    Personal: 'badge-personal',
  }[task.category]

  const checkboxCls = [
    'task-card__checkbox',
    task.isCompleted && 'task-card__checkbox--checked',
    !canComplete && 'task-card__checkbox--disabled',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <div
        className={`task-card${isUrgent ? ' task-card--urgent' : ''}`}
        {...swipeHandlers}
      >
        {/* Swipe background */}
        <div
          className="task-card__swipe-bg"
          style={{ width: swipeOffset }}
        >
          {swipeOffset > 40 && (
            <svg className="task-card__swipe-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {/* Card content */}
        <div
          className="task-card__content"
          style={{ transform: `translateX(${swipeOffset}px)` }}
        >
          <div className="task-card__row">
            {/* Checkbox */}
            <button
              onClick={handleComplete}
              disabled={!canComplete}
              className={checkboxCls}
            >
              {task.isCompleted && (
                <svg className="task-card__checkbox-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            {/* Body */}
            <div className="task-card__body">
              <div className="task-card__title-row">
                <span className={`task-card__title${task.isCompleted ? ' task-card__title--completed' : ''}`}>
                  {task.title}
                </span>
                <span className={`badge ${categoryClass}`}>{task.category}</span>
                {task.subTasks.length > 0 && (
                  <span className="task-card__counter">
                    {completedCount}/{task.subTasks.length}
                  </span>
                )}
              </div>

              {/* Deadline */}
              {task.deadline && (
                <div className={`task-card__deadline${isUrgent ? ' task-card__deadline--urgent' : ''}`}>
                  {new Date(task.deadline).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              )}

              {/* Subtasks toggle */}
              {(task.subTasks.length > 0 || isExpanded) && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="task-card__subtask-toggle"
                >
                  {isExpanded ? '▼ Hide subtasks' : '▶ Show subtasks'}
                </button>
              )}

              {/* Subtasks list */}
              {isExpanded && (
                <div className="task-card__subtasks">
                  {task.subTasks.map((sub) => (
                    <div key={sub.id} className="task-card__subtask">
                      <button
                        onClick={() => handleSubTaskToggle(sub.id, sub.completed)}
                        className={`task-card__subtask-checkbox${sub.completed ? ' task-card__subtask-checkbox--checked' : ''}`}
                      >
                        {sub.completed && (
                          <svg className="task-card__subtask-check-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                          className="task-card__subtask-input"
                          autoFocus
                        />
                      ) : (
                        <span className={`task-card__subtask-text${sub.completed ? ' task-card__subtask-text--completed' : ''}`}>
                          {sub.text}
                        </span>
                      )}

                      <button
                        onClick={() => startEditingSubTask(sub.id, sub.text)}
                        className="task-card__subtask-edit-btn"
                        title="Edit subtask"
                      >
                        <svg className="task-card__subtask-edit-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>

                      <button
                        onClick={() => handleDeleteSubTask(sub.id)}
                        className="task-card__subtask-delete"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {/* Add subtask form */}
                  <form onSubmit={handleAddSubTask} className="task-card__subtask-form">
                    <input
                      type="text"
                      value={newSubTaskText}
                      onChange={(e) => setNewSubTaskText(e.target.value)}
                      placeholder="Add subtask..."
                      className="task-card__subtask-form-input"
                    />
                    <button type="submit" className="task-card__subtask-form-submit">
                      Add
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Edit button */}
            <button
              onClick={() => setIsEditing(true)}
              className="task-card__edit-btn"
              title="Edit task"
            >
              <svg className="task-card__edit-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>

            {/* Delete button */}
            {onDelete && (
              <button
                onClick={() => onDelete(task.id)}
                className="task-card__delete-btn"
              >
                <svg className="task-card__delete-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {isEditing && (
        <TaskEditModal task={task} onClose={() => setIsEditing(false)} />
      )}
    </>
  )
}

export default TaskCard
