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

  return (
    <div className="bg-surface-600/50 rounded-lg overflow-hidden">
      <div className="p-2">
        <div className="flex items-center justify-between mb-1">
          <Link
            to={`/goals/${goal.id}`}
            className="text-sm text-gray-300 hover:text-gray-100 flex-1 truncate"
          >
            {goal.title}
          </Link>
          <div className="flex items-center gap-2 ml-2">
            <span className={`font-mono text-sm ${isComplete ? 'text-accent-green' : 'text-gray-100'}`}>
              {progressLabel}
            </span>
            {goal.goalType === 'frequency' && !isComplete && (
              <button
                onClick={onQuickLog}
                disabled={isLogging}
                className="w-6 h-6 rounded bg-surface-500 text-gray-400 hover:bg-accent-green hover:text-white
                         flex items-center justify-center text-xs transition-colors disabled:opacity-50"
                title="Quick log"
              >
                <FontAwesomeIcon icon={faPlus} />
              </button>
            )}
            <button
              onClick={onToggle}
              className="w-6 h-6 rounded bg-surface-500 text-gray-400 hover:bg-surface-400 hover:text-gray-200
                       flex items-center justify-center transition-colors"
              title={isExpanded ? 'Hide logs' : 'Show logs'}
            >
              <FontAwesomeIcon
                icon={faChevronDown}
                className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
        </div>

        <div className="h-1.5 bg-surface-500 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isComplete ? 'bg-accent-green' :
              goal.goalType === 'reading' ? 'bg-accent-blue' : 'bg-accent-amber'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-surface-500 bg-surface-700/50">
          {isLogsLoading ? (
            <div className="px-3 py-2 text-xs text-gray-500 text-center">
              Loading logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500 text-center">
              No logs yet
            </div>
          ) : (
            <div className="max-h-40 overflow-y-auto">
              {logs.map((log: GoalLog) => (
                <div
                  key={log.id}
                  className="px-3 py-1.5 flex items-center gap-2 text-xs border-b border-surface-600 last:border-b-0"
                >
                  <span className="text-gray-500 w-14">
                    {formatLogDate(log.logDate)}
                  </span>
                  <span className={`font-mono ${log.value > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {log.value > 0 ? '+' : ''}{log.value}
                  </span>
                  {log.note && (
                    <span className="text-gray-400 truncate flex-1">
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
