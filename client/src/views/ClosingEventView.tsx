import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useWeeklySummary } from '@/hooks';
import { IntegrityHeatmap } from '@/components/IntegrityHeatmap';
import { SpendingChart } from '@/components/SpendingChart';
import { GoalsProgress } from '@/components/GoalsProgress';
import type { WorkLog } from '@/types';

// Day Notes Modal Component
function DayNotesModal({ 
  log, 
  date, 
  onClose 
}: { 
  log: WorkLog | null; 
  date: string; 
  onClose: () => void;
}) {
  if (!log) return null;

  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric' 
  });

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-surface-800 w-full max-w-sm rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">
            {formattedDate}
          </h2>
          <div className={`text-2xl ${log.integrityScore === 1 ? 'text-accent-green' : 'text-accent-red'}`}>
            {log.integrityScore === 1 ? '✓' : '✗'}
          </div>
        </div>

        <div className="space-y-4">
          {/* Success Note */}
          <div>
            <div className="text-xs text-accent-green font-medium mb-1 flex items-center gap-1">
              <span>✓</span> What went well
            </div>
            {log.successNote ? (
              <div className="text-sm text-gray-300 bg-accent-green/10 rounded-lg p-3 border-l-2 border-accent-green">
                {log.successNote}
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">No notes recorded</div>
            )}
          </div>

          {/* Missed Opportunity Note */}
          <div>
            <div className="text-xs text-accent-red font-medium mb-1 flex items-center gap-1">
              <span>✗</span> What could improve
            </div>
            {log.missedOpportunityNote ? (
              <div className="text-sm text-gray-300 bg-accent-red/10 rounded-lg p-3 border-l-2 border-accent-red">
                {log.missedOpportunityNote}
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">No notes recorded</div>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="btn btn-ghost w-full mt-4"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function ClosingEventView() {
  const { data: summary, isLoading } = useWeeklySummary();
  const [reflection, setReflection] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [selectedDay, setSelectedDay] = useState<{ log: WorkLog | null; date: string } | null>(null);

  // Auto-populate reflection with missed opportunity notes
  const autoPopulatedContent = useMemo(() => {
    if (!summary || summary.missedOpportunityNotes.length === 0) return '';
    
    let content = '## Missed Opportunities This Week\n\n';
    summary.missedOpportunityNotes.forEach((note, i) => {
      content += `${i + 1}. ${note}\n`;
    });
    content += '\n## Points to Improve\n\n- ';
    return content;
  }, [summary]);

  // Set auto-populated content when summary loads
  useState(() => {
    if (autoPopulatedContent && !reflection) {
      setReflection(autoPopulatedContent);
    }
  });

  const handleUseTemplate = () => {
    setReflection(autoPopulatedContent);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-gray-500">Loading weekly data...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-gray-500">No data available</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface-900/95 backdrop-blur-sm border-b border-surface-700">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-100 mt-1">
              Weekly Closing Event
            </h1>
            <p className="text-xs text-gray-500 font-mono">
              {summary.weekStart} → {summary.weekEnd}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-gray-100">
              {summary.integrityRate}%
            </div>
            <div className="text-xs text-gray-500">Integrity Rate</div>
          </div>
        </div>
      </header>

      {/* Desktop: Two-pane layout, Mobile: Stacked */}
      <div className="lg:flex lg:h-[calc(100vh-80px)]">
        {/* Left Pane: Data Audit */}
        <div className="lg:w-1/2 lg:border-r lg:border-surface-700 lg:overflow-y-auto p-4 space-y-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Data Audit
          </h2>

          {/* Integrity Heatmap */}
          <IntegrityHeatmap 
            workLogs={summary.workLogs} 
            weekStart={summary.weekStart}
            onDayClick={(log, date) => setSelectedDay({ log, date })}
          />

          {/* Spending */}
          <SpendingChart 
            expensesByCategory={summary.expensesByCategory}
            totalExpenses={summary.totalExpenses}
          />

        {/* Goals */}
        <GoalsProgress goals={summary.goals} />

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-700 rounded-lg p-3">
              <div className="text-xs text-gray-500">Total Expenses</div>
              <div className="font-mono text-lg text-gray-100">
                ${summary.totalExpenses.toFixed(2)}
              </div>
            </div>
            <div className="bg-surface-700 rounded-lg p-3">
              <div className="text-xs text-gray-500">Days Logged</div>
              <div className="font-mono text-lg text-gray-100">
                {summary.workLogs.filter(l => l.integrityScore !== null).length}/7
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane: Reflection */}
        <div className="lg:w-1/2 lg:overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Weekly Reflection
            </h2>
            <div className="flex gap-2">
              {autoPopulatedContent && !reflection && (
                <button
                  onClick={handleUseTemplate}
                  className="text-xs text-accent-blue hover:text-blue-400"
                >
                  Use Template
                </button>
              )}
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                {showPreview ? 'Edit' : 'Preview'}
              </button>
            </div>
          </div>

          {/* Auto-populated notes hint */}
          {summary.missedOpportunityNotes.length > 0 && !reflection && (
            <div className="bg-surface-700 rounded-lg p-3 border-l-2 border-accent-amber">
              <div className="text-xs text-accent-amber mb-1">
                {summary.missedOpportunityNotes.length} missed opportunity notes this week
              </div>
              <div className="text-xs text-gray-500">
                Click "Use Template" to auto-populate your reflection
              </div>
            </div>
          )}

          {showPreview ? (
            /* Markdown Preview */
            <div className="bg-surface-700 rounded-lg p-4 min-h-[300px] markdown-content">
              {reflection ? (
                <ReactMarkdown>{reflection}</ReactMarkdown>
              ) : (
                <div className="text-gray-500 text-sm">
                  Nothing to preview yet. Write your reflection first.
                </div>
              )}
            </div>
          ) : (
            /* Editor */
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="## Points to Improve

- What patterns did you notice?
- What will you change next week?
- What went well?

Use markdown for formatting..."
              className="w-full h-[400px] lg:h-[calc(100vh-240px)] bg-surface-700 rounded-lg p-4 
                       text-sm font-mono resize-none"
            />
          )}

          {/* Save indicator */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Supports Markdown</span>
            <span>{reflection.length} characters</span>
          </div>
        </div>
      </div>

      {/* Day Notes Modal */}
      {selectedDay && (
        <DayNotesModal
          log={selectedDay.log}
          date={selectedDay.date}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

