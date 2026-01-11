import type { WorkLog } from '@/types';

interface IntegrityHeatmapProps {
  workLogs: WorkLog[];
  weekStart: string;
  onDayClick?: (log: WorkLog | null, date: string) => void;
}

export function IntegrityHeatmap({ workLogs, weekStart, onDayClick }: IntegrityHeatmapProps) {
  // Generate 7 days starting from weekStart
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return date.toISOString().split('T')[0];
  });

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getLogForDate = (date: string) => {
    return workLogs.find(l => l.logDate === date);
  };

  const successCount = workLogs.filter(l => l.integrityScore === 1).length;
  const failCount = workLogs.filter(l => l.integrityScore === 0).length;

  const handleDayClick = (date: string) => {
    if (!onDayClick) return;
    const log = getLogForDate(date);
    onDayClick(log || null, date);
  };

  return (
    <div className="bg-surface-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-300">Integrity Heatmap</h3>
        <div className="flex gap-2 text-xs">
          <span className="text-accent-green">{successCount}✓</span>
          <span className="text-accent-red">{failCount}✗</span>
        </div>
      </div>

      <div className="flex justify-between gap-1">
        {days.map((date, i) => {
          const log = getLogForDate(date);
          const score = log?.integrityScore;
          const isToday = date === new Date().toISOString().split('T')[0];
          const hasNotes = log?.successNote || log?.missedOpportunityNote;
          const isClickable = !!onDayClick && (log !== undefined);
          
          return (
            <div key={date} className="flex-1 text-center">
              <div className="text-[10px] text-gray-500 mb-1">{dayNames[i]}</div>
              <div 
                onClick={() => isClickable && handleDayClick(date)}
                className={`heatmap-cell mx-auto ${
                  score === 1 ? 'heatmap-success' : 
                  score === 0 ? 'heatmap-fail' : 
                  'heatmap-empty'
                } ${isToday ? 'ring-1 ring-accent-blue' : ''} ${
                  isClickable ? 'cursor-pointer hover:scale-110 transition-transform' : ''
                } ${hasNotes ? 'ring-1 ring-white/30' : ''}`}
                title={`${date}: ${score === 1 ? 'Success' : score === 0 ? 'Missed' : 'No log'}${hasNotes ? ' (has notes)' : ''}`}
              >
                {score === 1 ? '1' : score === 0 ? '0' : '–'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

