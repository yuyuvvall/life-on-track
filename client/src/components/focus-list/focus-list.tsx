import './focus-list.less'
import { useMemo } from 'react'
import { TaskCard } from '../task-card'
import { useTasks, useDeleteTask } from '@/hooks'
import type { Task } from '@/types'

const FocusList = () => {
  const { data: tasks, isLoading } = useTasks()
  const deleteTask = useDeleteTask()

  const sortedTasks = useMemo(() => {
    if (!tasks) return []

    const now = Date.now()
    const twoDaysFromNow = now + 2 * 24 * 60 * 60 * 1000

    return [...tasks]
      .filter(t => !t.isCompleted)
      .sort((a, b) => {
        if (a.deadline && b.deadline) {
          const aDate = new Date(a.deadline).getTime()
          const bDate = new Date(b.deadline).getTime()

          const aUrgent = aDate <= twoDaysFromNow
          const bUrgent = bDate <= twoDaysFromNow

          if (aUrgent && !bUrgent) return -1
          if (!aUrgent && bUrgent) return 1

          return aDate - bDate
        }

        if (a.deadline && !b.deadline) return -1
        if (!a.deadline && b.deadline) return 1

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  }, [tasks])

  const completedTasks = useMemo(() => {
    return tasks?.filter(t => t.isCompleted) || []
  }, [tasks])

  const handleDelete = (id: string) => {
    deleteTask.mutate(id)
  }

  if (isLoading) {
    return (
      <div className="focus-list">
        {[1, 2, 3].map((i) => (
          <div key={i} className="focus-list__skeleton" />
        ))}
      </div>
    )
  }

  if (sortedTasks.length === 0 && completedTasks.length === 0) {
    return (
      <div className="focus-list__empty">
        <div className="focus-list__empty-title">No tasks yet</div>
        <div className="focus-list__empty-hint">
          Long press the + button to add a task
        </div>
      </div>
    )
  }

  return (
    <div className="focus-list">
      {sortedTasks.map((task: Task) => (
        <TaskCard
          key={task.id}
          task={task}
          onDelete={handleDelete}
        />
      ))}

      {completedTasks.length > 0 && (
        <div className="focus-list__completed">
          <div className="focus-list__completed-header">
            Completed ({completedTasks.length})
          </div>
          <div className="focus-list__completed-list">
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
  )
}

export default FocusList
