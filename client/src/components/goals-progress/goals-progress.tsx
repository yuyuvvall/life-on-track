import './goals-progress.less'
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
      <div className="goals-progress">
        <div className="goals-progress__header">
          <h3 className="goals-progress__title">Goals Progress</h3>
          <Link to="/goals" className="goals-progress__link">
            Add Goals
          </Link>
        </div>
        <div className="goals-progress__empty">
          No goals set
        </div>
      </div>
    )
  }

  return (
    <div className="goals-progress">
      <div className="goals-progress__header">
        <h3 className="goals-progress__title">Goals Progress</h3>
        <Link to="/goals" className="goals-progress__link">
          View All
        </Link>
      </div>

      <div className="goals-progress__list">
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
          className="goals-progress__more-link"
        >
          +{goals.length - 4} more goals
        </Link>
      )}
    </div>
  )
}

export default GoalsProgress
