import { Link } from 'react-router-dom';
import type { Goal } from '@/types';
import { useLogGoalProgress } from '@/hooks';

interface GoalsProgressProps {
  goals: Goal[];
}

export function GoalsProgress({ goals }: GoalsProgressProps) {
  const logProgress = useLogGoalProgress();

  const handleQuickLog = (goal: Goal) => {
    if (goal.goalType === 'frequency') {
      // For frequency goals, log a 1 (one occurrence)
      logProgress.mutate({ id: goal.id, data: { value: 1 } });
    }
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
        {goals.slice(0, 4).map((goal) => {
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

          return (
            <Link key={goal.id} to={`/goals/${goal.id}`} className="block group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-300 group-hover:text-gray-100">
                  {goal.title}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-sm ${isComplete ? 'text-accent-green' : 'text-gray-100'}`}>
                    {progressLabel}
                  </span>
                  {goal.goalType === 'frequency' && !isComplete && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleQuickLog(goal);
                      }}
                      className="w-6 h-6 rounded bg-surface-600 text-gray-400 hover:bg-accent-green hover:text-white 
                               flex items-center justify-center text-xs transition-colors"
                      title="Quick log"
                    >
                      +
                    </button>
                  )}
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
            </Link>
          );
        })}
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
