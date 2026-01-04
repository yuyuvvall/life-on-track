import { Link } from 'react-router-dom';
import type { Goal } from '@/types';

interface GoalCardProps {
  goal: Goal;
  onDelete?: (id: string) => void;
}

export function GoalCard({ goal, onDelete }: GoalCardProps) {
  const getProgressInfo = () => {
    if (goal.goalType === 'reading' && goal.totalPages) {
      const percent = Math.round((goal.currentPage / goal.totalPages) * 100);
      return {
        label: `${goal.currentPage} / ${goal.totalPages} pages`,
        percent,
        color: percent >= 100 ? 'bg-accent-green' : 'bg-accent-blue',
      };
    } else if (goal.goalType === 'frequency') {
      const percent = goal.targetValue > 0 
        ? Math.round((goal.currentValue / goal.targetValue) * 100) 
        : 0;
      return {
        label: `${goal.currentValue} / ${goal.targetValue} ${goal.unit || 'times'} ${goal.frequencyPeriod || 'weekly'}`,
        percent: Math.min(percent, 100),
        color: percent >= 100 ? 'bg-accent-green' : 'bg-accent-amber',
      };
    } else {
      const percent = goal.targetValue > 0 
        ? Math.round((goal.currentValue / goal.targetValue) * 100) 
        : 0;
      return {
        label: `${goal.currentValue} / ${goal.targetValue} ${goal.unit || ''}`,
        percent: Math.min(percent, 100),
        color: percent >= 100 ? 'bg-accent-green' : 'bg-purple-500',
      };
    }
  };

  const progress = getProgressInfo();
  const typeIcon = goal.goalType === 'reading' ? '📖' : goal.goalType === 'frequency' ? '🔄' : '📊';

  return (
    <Link 
      to={`/goals/${goal.id}`}
      className="block bg-surface-700 rounded-lg p-4 hover:bg-surface-600 transition-colors group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeIcon}</span>
          <h3 className="font-medium text-gray-100 group-hover:text-white">
            {goal.title}
          </h3>
        </div>
        {onDelete && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(goal.id);
            }}
            className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-accent-red text-sm transition-opacity"
          >
            Archive
          </button>
        )}
      </div>

      {/* Progress info */}
      <div className="text-xs text-gray-400 font-mono mb-2">
        {progress.label}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-surface-500 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all ${progress.color}`}
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      {/* Target date if set */}
      {goal.targetDate && (
        <div className="mt-2 text-xs text-gray-500">
          Target: {new Date(goal.targetDate).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          })}
        </div>
      )}
    </Link>
  );
}

