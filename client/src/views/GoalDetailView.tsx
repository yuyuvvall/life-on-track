import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useGoalStats, useLogGoalProgress, useDeleteGoal, useUpdateGoal } from '@/hooks';
import { GoalFormModal } from '@/components/GoalFormModal';
import type { Goal } from '@/types';

export function GoalDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: stats, isLoading } = useGoalStats(id!);
  const logProgress = useLogGoalProgress();
  const deleteGoal = useDeleteGoal();
  const updateGoal = useUpdateGoal();

  const [logValue, setLogValue] = useState('');
  const [logNote, setLogNote] = useState('');
  const [showLogForm, setShowLogForm] = useState(false);
  const [showAddSubGoal, setShowAddSubGoal] = useState(false);

  if (isLoading || !stats) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-gray-500">Loading goal...</div>
      </div>
    );
  }

  const { goal, logs, subGoals, subGoalsCompleted, velocity, estimatedFinishDate, daysRemaining, progressPercent, streak, periodProgress } = stats;

  const handleLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseInt(logValue);
    if (isNaN(value)) return;

    logProgress.mutate(
      { id: goal.id, data: { value, note: logNote || undefined } },
      {
        onSuccess: () => {
          setLogValue('');
          setLogNote('');
          setShowLogForm(false);
        },
      }
    );
  };

  const handleDelete = () => {
    if (confirm('Archive this goal? You can reactivate it later.')) {
      deleteGoal.mutate(goal.id, {
        onSuccess: () => navigate('/goals'),
      });
    }
  };

  const handleSubGoalComplete = (subGoal: Goal) => {
    // Toggle completion by setting current_value to target or 0
    const newValue = subGoal.currentValue >= subGoal.targetValue ? 0 : subGoal.targetValue;
    updateGoal.mutate({ id: subGoal.id, data: { currentValue: newValue } });
  };

  const typeIcon = goal.goalType === 'reading' ? '📖' : goal.goalType === 'frequency' ? '🔄' : '📊';
  const hasSubGoals = subGoals.length > 0;

  return (
    <div className="min-h-screen bg-surface-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface-900/95 backdrop-blur-sm border-b border-surface-700">
        <div className="px-4 py-3">
          <Link to="/goals" className="text-xs text-accent-blue hover:text-blue-400">
            ← All Goals
          </Link>
          <div className="flex items-center justify-between mt-1">
            <h1 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
              <span>{typeIcon}</span>
              {goal.title}
            </h1>
            <button
              onClick={handleDelete}
              className="text-xs text-gray-500 hover:text-accent-red"
            >
              Archive
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Progress Overview */}
        <div className="bg-surface-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">Progress</span>
            <span className="font-mono text-lg font-bold text-gray-100">{progressPercent}%</span>
          </div>
          <div className="h-3 bg-surface-500 rounded-full overflow-hidden mb-3">
            <div 
              className={`h-full rounded-full transition-all ${
                progressPercent >= 100 ? 'bg-accent-green' : 'bg-accent-blue'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Type-specific details */}
          {goal.goalType === 'reading' && goal.totalPages && (
            <div className="text-sm text-gray-400">
              <span className="font-mono text-gray-100">{goal.currentPage}</span> of{' '}
              <span className="font-mono text-gray-100">{goal.totalPages}</span> pages
            </div>
          )}

          {goal.goalType === 'frequency' && periodProgress && (
            <div className="text-sm text-gray-400">
              <span className="font-mono text-gray-100">{periodProgress.current}</span> of{' '}
              <span className="font-mono text-gray-100">{periodProgress.target}</span> this {goal.frequencyPeriod}
            </div>
          )}

          {goal.goalType === 'numeric' && !hasSubGoals && (
            <div className="text-sm text-gray-400">
              <span className="font-mono text-gray-100">{goal.currentValue}</span> of{' '}
              <span className="font-mono text-gray-100">{goal.targetValue}</span> {goal.unit}
            </div>
          )}

          {goal.goalType === 'numeric' && hasSubGoals && (
            <div className="text-sm text-gray-400">
              <span className="font-mono text-gray-100">{subGoalsCompleted}</span> of{' '}
              <span className="font-mono text-gray-100">{subGoals.length}</span> sub-goals completed
            </div>
          )}
        </div>

        {/* Velocity & Projections (Reading goals) */}
        {goal.goalType === 'reading' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-700 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Reading Velocity</div>
              <div className="font-mono text-xl font-bold text-accent-blue">
                {velocity !== null ? `${velocity}` : '—'}
              </div>
              <div className="text-xs text-gray-500">pages/day</div>
            </div>
            <div className="bg-surface-700 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">Est. Finish</div>
              <div className="font-mono text-xl font-bold text-accent-green">
                {estimatedFinishDate 
                  ? new Date(estimatedFinishDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </div>
              <div className="text-xs text-gray-500">
                {daysRemaining !== null ? `${daysRemaining} days left` : 'Keep reading!'}
              </div>
            </div>
          </div>
        )}

        {/* Sub-Goals Section (for numeric goals) */}
        {goal.goalType === 'numeric' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
                Sub-Goals ({subGoalsCompleted}/{subGoals.length})
              </h2>
              <button
                onClick={() => setShowAddSubGoal(true)}
                className="text-xs text-accent-blue hover:text-blue-400"
              >
                + Add Sub-Goal
              </button>
            </div>

            {subGoals.length === 0 ? (
              <div className="bg-surface-700 rounded-lg p-4 text-center">
                <div className="text-gray-500 text-sm mb-2">No sub-goals yet</div>
                <button
                  onClick={() => setShowAddSubGoal(true)}
                  className="text-xs text-accent-blue hover:text-blue-400"
                >
                  Add your first sub-goal (e.g., Bench Press 100kg)
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {subGoals.map((sg) => {
                  const isComplete = sg.currentValue >= sg.targetValue;
                  const sgPercent = sg.targetValue > 0 
                    ? Math.min(Math.round((sg.currentValue / sg.targetValue) * 100), 100)
                    : 0;

                  return (
                    <div 
                      key={sg.id} 
                      className={`bg-surface-700 rounded-lg p-3 ${isComplete ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleSubGoalComplete(sg)}
                          className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors
                            ${isComplete 
                              ? 'bg-accent-green border-accent-green' 
                              : 'border-gray-500 hover:border-accent-green'}`}
                        >
                          {isComplete && (
                            <svg className="w-3 h-3 text-surface-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm ${isComplete ? 'text-gray-500 line-through' : 'text-gray-100'}`}>
                              {sg.title}
                            </span>
                            <span className="font-mono text-xs text-gray-400">
                              {sg.currentValue}/{sg.targetValue} {sg.unit}
                            </span>
                          </div>
                          <div className="h-1 bg-surface-500 rounded-full overflow-hidden mt-1">
                            <div 
                              className={`h-full rounded-full transition-all ${isComplete ? 'bg-accent-green' : 'bg-accent-amber'}`}
                              style={{ width: `${sgPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface-700 rounded-lg p-3 text-center">
            <div className="font-mono text-xl font-bold text-accent-amber">{streak}</div>
            <div className="text-xs text-gray-500">Day Streak</div>
          </div>
          <div className="bg-surface-700 rounded-lg p-3 text-center">
            <div className="font-mono text-xl font-bold text-gray-100">{logs.length}</div>
            <div className="text-xs text-gray-500">Total Logs</div>
          </div>
          <div className="bg-surface-700 rounded-lg p-3 text-center">
            <div className="font-mono text-xl font-bold text-gray-100">
              {goal.startDate 
                ? Math.ceil((Date.now() - new Date(goal.startDate).getTime()) / (1000 * 60 * 60 * 24))
                : 0}
            </div>
            <div className="text-xs text-gray-500">Days Active</div>
          </div>
        </div>

        {/* Log Progress Button */}
        {!showLogForm && (
          <button
            onClick={() => setShowLogForm(true)}
            className="w-full btn btn-primary py-3 text-base"
          >
            + Log Progress
          </button>
        )}

        {/* Log Form */}
        {showLogForm && (
          <form onSubmit={handleLogSubmit} className="bg-surface-700 rounded-lg p-4 space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {goal.goalType === 'reading' 
                  ? 'Current Page' 
                  : goal.goalType === 'frequency'
                    ? 'Log Entry (1 = done)'
                    : `Current ${goal.unit || 'Value'}`}
              </label>
              <input
                type="number"
                value={logValue}
                onChange={(e) => setLogValue(e.target.value)}
                placeholder={goal.goalType === 'reading' ? 'e.g., 85' : 'Enter value'}
                className="w-full text-lg font-mono"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Note (optional)</label>
              <input
                type="text"
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                placeholder="Any notes..."
                className="w-full"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="btn btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!logValue || logProgress.isPending}
                className="btn btn-primary flex-1"
              >
                {logProgress.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        )}

        {/* Progress History */}
        <div>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Progress History
          </h2>
          
          {logs.length === 0 ? (
            <div className="bg-surface-700 rounded-lg p-4 text-center text-gray-500 text-sm">
              No logs yet. Start tracking your progress!
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log, index) => {
                const prevLog = logs[index + 1];
                const diff = prevLog ? log.value - prevLog.value : null;
                
                return (
                  <div key={log.id} className="bg-surface-700 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-gray-500">
                        {new Date(log.logDate).toLocaleDateString('en-US', { 
                          weekday: 'short',
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                      {log.note && (
                        <div className="text-xs text-gray-400 mt-0.5 italic">"{log.note}"</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-gray-100">
                        {log.value}
                        {goal.goalType === 'reading' && <span className="text-xs text-gray-500"> pg</span>}
                      </div>
                      {diff !== null && diff !== 0 && (
                        <div className={`text-xs font-mono ${diff > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                          {diff > 0 ? '+' : ''}{diff}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Add Sub-Goal Modal */}
      {showAddSubGoal && (
        <GoalFormModal 
          onClose={() => setShowAddSubGoal(false)} 
          parentId={goal.id}
          parentTitle={goal.title}
        />
      )}
    </div>
  );
}
