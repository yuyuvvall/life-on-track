import { Link } from 'react-router-dom';
import { useGoals, useWeeklySummary } from '@/hooks';

export function WeeklyStats() {
  const { data: goals } = useGoals();
  const { data: summary } = useWeeklySummary();

  const stats = [
    ...(goals?.slice(0, 3).map(g => {
      let value = '';
      let percentage = 0;

      if (g.goalType === 'reading' && g.totalPages) {
        value = `${g.currentPage}/${g.totalPages}`;
        percentage = Math.round((g.currentPage / g.totalPages) * 100);
      } else if (g.goalType === 'frequency') {
        value = `${g.currentValue}/${g.targetValue}`;
        percentage = g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0;
      } else {
        value = `${g.currentValue}/${g.targetValue}`;
        percentage = g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0;
      }

      return {
        label: g.title,
        value,
        percentage: Math.min(percentage, 100),
        goalId: g.id,
      };
    }) || []),
    ...(summary ? [{
      label: 'Integrity',
      value: `${summary.integrityRate}%`,
      percentage: summary.integrityRate,
      goalId: null,
    }] : []),
  ];

  if (stats.length === 0) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        <Link 
          to="/goals" 
          className="bg-surface-700 rounded-lg px-3 py-2 flex-shrink-0 hover:bg-surface-600 transition-colors"
        >
          <span className="text-xs text-accent-blue">+ Add goals to track</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
      {stats.map((stat, i) => (
        <Link
          key={i}
          to={stat.goalId ? `/goals/${stat.goalId}` : '/weekly'}
          className="bg-surface-700 rounded-lg px-3 py-2 flex-shrink-0 min-w-[100px] hover:bg-surface-600 transition-colors"
        >
          <div className="text-xs text-gray-500 truncate">{stat.label}</div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="font-mono text-sm font-medium text-gray-100">
              {stat.value}
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-1.5 h-1 bg-surface-500 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${
                stat.percentage >= 100 ? 'bg-accent-green' : 
                stat.percentage >= 50 ? 'bg-accent-blue' : 
                'bg-accent-amber'
              }`}
              style={{ width: `${stat.percentage}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  );
}
