import { Link } from 'react-router-dom'
import type { Goal, GoalLog } from '@/types'
import GoalItem from './goal-item'

export type GoalsProgressProps = {
  goals: Goal[]
  expandedGoalId: string | null
  expandedGoalLogs: GoalLog[]
  isLogsLoading: boolean
  isLogging: boolean
  onGoalToggle: (goalId: string) => void
  onQuickLog: (goal: Goal) => void
}

const GoalsProgress = ({
  goals,
  expandedGoalId,
  expandedGoalLogs,
  isLogsLoading,
  isLogging,
  onGoalToggle,
  onQuickLog,
}: GoalsProgressProps) => {
  if (goals.length === 0) {
    return (
      <div className="bg-surface-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300">Goals Progress</h3>
          <Link to="/goals" className="text-xs text-accent-blue hover:text-blue-400">
            Add Goals
          </Link>
        </div>
        <div className="text-center py-4 text-gray-500 text-sm">
          No goals set
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-300">Goals Progress</h3>
        <Link to="/goals" className="text-xs text-accent-blue hover:text-blue-400">
          View All
        </Link>
      </div>

      <div className="space-y-3">
        {goals.slice(0, 4).map((goal) => (
          <GoalItem
            key={goal.id}
            goal={goal}
            isExpanded={expandedGoalId === goal.id}
            logs={expandedGoalId === goal.id ? expandedGoalLogs : []}
            isLogsLoading={expandedGoalId === goal.id && isLogsLoading}
            isLogging={isLogging}
            onToggle={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onGoalToggle(goal.id)
            }}
            onQuickLog={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onQuickLog(goal)
            }}
          />
        ))}
      </div>

      {goals.length > 4 && (
        <Link
          to="/goals"
          className="block text-center text-xs text-gray-500 hover:text-gray-300 mt-3"
        >
          +{goals.length - 4} more goals
        </Link>
      )}
    </div>
  )
}

export default GoalsProgress
