import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Goal, GoalLog } from '@/types';
import { useLogGoalProgress, useGoalLogs } from '@/hooks';

interface GoalsProgressProps {
  goals: Goal[];
}

export function GoalsProgress({ goals }: GoalsProgressProps) {
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);
  const logProgress = useLogGoalProgress();

  const handleQuickLog = (goal: Goal, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (goal.goalType === 'frequency') {
      logProgress.mutate({ id: goal.id, data: { value: 1 } });
    }
  };

  const toggleExpanded = (goalId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedGoalId(prev => prev === goalId ? null : goalId);
  };

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
    );
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
            onToggle={(e) => toggleExpanded(goal.id, e)}
            onQuickLog={(e) => handleQuickLog(goal, e)}
            isLogging={logProgress.isPending}
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
  );
}

// Individual goal item with accordion
function GoalItem({
  goal,
  isExpanded,
  onToggle,
  onQuickLog,
  isLogging,
}: {
  goal: Goal;
  isExpanded: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onQuickLog: (e: React.MouseEvent) => void;
  isLogging: boolean;
}) {
  // Only fetch logs when expanded
  const { data: logs = [], isLoading: logsLoading } = useGoalLogs(
    isExpanded ? goal.id : '',
    10
  );

  let progressPercent = 0;
  let progressLabel = '';

  if (goal.goalType === 'reading' && goal.totalPages) {
    progressPercent = Math.round((goal.currentPage / goal.totalPages) * 100);
    progressLabel = `${goal.currentPage}/${goal.totalPages} pg`;
  } else if (goal.goalType === 'frequency') {
    progressPercent = goal.targetValue > 0 
      ? Math.min(Math.round((goal.currentValue / goal.targetValue) * 100), 100)
      : 0;
    progressLabel = `${goal.currentValue}/${goal.targetValue}`;
  } else {
    progressPercent = goal.targetValue > 0
      ? Math.min(Math.round((goal.currentValue / goal.targetValue) * 100), 100)
      : 0;
    progressLabel = `${goal.currentValue}/${goal.targetValue}`;
  }

  const isComplete = progressPercent >= 100;

  const formatLogDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-surface-600/50 rounded-lg overflow-hidden">
      {/* Header row */}
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
                +
              </button>
            )}
            {/* Accordion toggle */}
            <button
              onClick={onToggle}
              className="w-6 h-6 rounded bg-surface-500 text-gray-400 hover:bg-surface-400 hover:text-gray-200 
                       flex items-center justify-center transition-colors"
              title={isExpanded ? 'Hide logs' : 'Show logs'}
            >
              <svg 
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Progress bar */}
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

      {/* Logs accordion */}
      {isExpanded && (
        <div className="border-t border-surface-500 bg-surface-700/50">
          {logsLoading ? (
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
  );
}
