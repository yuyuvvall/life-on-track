import './goal-item.less'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faChevronDown } from '@fortawesome/free-solid-svg-icons'
import type { Goal, GoalLog } from '@/types'

export type GoalItemProps = {
  goal: Goal
  isExpanded: boolean
  logs: GoalLog[]
  isLogsLoading: boolean
  isLogging: boolean
  onToggle: (e: React.MouseEvent) => void
  onQuickLog: (e: React.MouseEvent) => void
}

const GoalItem = ({
  goal,
  isExpanded,
  logs,
  isLogsLoading,
  isLogging,
  onToggle,
  onQuickLog,
}: GoalItemProps) => {
  let progressPercent = 0
  let progressLabel = ''

  if (goal.goalType === 'reading' && goal.totalPages) {
    progressPercent = Math.round((goal.currentPage / goal.totalPages) * 100)
    progressLabel = `${goal.currentPage}/${goal.totalPages} pg`
  } else if (goal.goalType === 'frequency') {
    progressPercent = goal.targetValue > 0
      ? Math.min(Math.round((goal.currentValue / goal.targetValue) * 100), 100)
      : 0
    progressLabel = `${goal.currentValue}/${goal.targetValue}`
  } else {
    progressPercent = goal.targetValue > 0
      ? Math.min(Math.round((goal.currentValue / goal.targetValue) * 100), 100)
      : 0
    progressLabel = `${goal.currentValue}/${goal.targetValue}`
  }

  const isComplete = progressPercent >= 100

  const formatLogDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const fillModifier = isComplete
    ? 'goal-item__progress-fill--complete'
    : goal.goalType === 'reading'
      ? 'goal-item__progress-fill--reading'
      : 'goal-item__progress-fill--default'

  return (
    <div className="goal-item">
      <div className="goal-item__content">
        <div className="goal-item__row">
          <Link
            to={`/goals/${goal.id}`}
            className="goal-item__title"
          >
            {goal.title}
          </Link>
          <div className="goal-item__actions">
            <span className={`goal-item__progress-label${isComplete ? ' goal-item__progress-label--complete' : ''}`}>
              {progressLabel}
            </span>
            {goal.goalType === 'frequency' && !isComplete && (
              <button
                onClick={onQuickLog}
                disabled={isLogging}
                className="goal-item__quick-log-btn"
                title="Quick log"
              >
                <FontAwesomeIcon icon={faPlus} />
              </button>
            )}
            <button
              onClick={onToggle}
              className="goal-item__toggle-btn"
              title={isExpanded ? 'Hide logs' : 'Show logs'}
            >
              <FontAwesomeIcon
                icon={faChevronDown}
                className={`goal-item__chevron${isExpanded ? ' goal-item__chevron--expanded' : ''}`}
              />
            </button>
          </div>
        </div>

        <div className="goal-item__progress-track">
          <div
            className={`goal-item__progress-fill ${fillModifier}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="goal-item__logs">
          {isLogsLoading ? (
            <div className="goal-item__logs-message">
              Loading logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="goal-item__logs-message">
              No logs yet
            </div>
          ) : (
            <div className="goal-item__logs-list">
              {logs.map((log: GoalLog) => (
                <div
                  key={log.id}
                  className="goal-item__log-entry"
                >
                  <span className="goal-item__log-date">
                    {formatLogDate(log.logDate)}
                  </span>
                  <span className={`goal-item__log-value${log.value > 0 ? ' goal-item__log-value--positive' : ' goal-item__log-value--negative'}`}>
                    {log.value > 0 ? '+' : ''}{log.value}
                  </span>
                  {log.note && (
                    <span className="goal-item__log-note">
                      "{log.note}"
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default GoalItem
