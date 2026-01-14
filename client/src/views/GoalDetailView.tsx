import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useGoalStats, useLogGoalProgress, useDeleteGoal, useUpdateGoalLog } from '@/hooks';
import { GoalFormModal } from '@/components/GoalFormModal';
import type { Goal, GoalLog } from '@/types';

// Goal Log Edit Modal Component
function GoalLogEditModal({ 
  log, 
  goal, 
  onClose 
}: { 
  log: GoalLog; 
  goal: Goal; 
  onClose: () => void;
}) {
  const updateGoalLog = useUpdateGoalLog();
  const [value, setValue] = useState(log.value.toString());
  const [note, setNote] = useState(log.note || '');
  const [logDate, setLogDate] = useState(log.logDate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numValue = parseInt(value);
    if (isNaN(numValue)) return;

    updateGoalLog.mutate(
      { 
        goalId: goal.id, 
        logId: log.id, 
        data: { 
          value: numValue, 
          note: note || undefined, 
          logDate 
        } 
      },
      { onSuccess: onClose }
    );
  };

  // For frequency goals, use toggle buttons instead of number input
  const handleToggleValue = (newValue: 0 | 1) => {
    setValue(newValue.toString());
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-surface-800 w-full max-w-sm rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-100 mb-4">Edit Log</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Value - depends on goal type */}
          {goal.goalType === 'frequency' ? (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleValue(1)}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                    value === '1'
                      ? 'bg-accent-green text-white'
                      : 'bg-surface-700 text-gray-400 hover:bg-surface-600'
                  }`}
                >
                  ✓ Did it
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleValue(0)}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                    value === '0'
                      ? 'bg-accent-red text-white'
                      : 'bg-surface-700 text-gray-400 hover:bg-surface-600'
                  }`}
                >
                  ✗ Didn't
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {goal.goalType === 'reading' ? 'Page Number' : `Value (${goal.unit || 'units'})`}
              </label>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full text-lg font-mono"
              />
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any notes..."
              className="w-full"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateGoalLog.isPending}
              className="btn btn-primary flex-1"
            >
              {updateGoalLog.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function GoalDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: stats, isLoading } = useGoalStats(id!);
  const logProgress = useLogGoalProgress();
  const deleteGoal = useDeleteGoal();

  const [logValue, setLogValue] = useState('');
  const [logNote, setLogNote] = useState('');
  const [showLogForm, setShowLogForm] = useState(false);
  const [showAddSubGoal, setShowAddSubGoal] = useState(false);
  const [showEditGoal, setShowEditGoal] = useState(false);
  
  // Habit-specific state
  const [habitNote, setHabitNote] = useState('');
  const [showHabitNoteFor, setShowHabitNoteFor] = useState<'did' | 'didnt' | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'positive' | 'negative' | null>(null);
  const [editingLog, setEditingLog] = useState<GoalLog | null>(null);

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

  // Habit goal: log with value 1 (did it) or 0 (didn't)
  const handleHabitLog = (value: 0 | 1) => {
    logProgress.mutate(
      { id: goal.id, data: { value, note: habitNote || undefined } },
      {
        onSuccess: () => {
          setHabitNote('');
          setShowHabitNoteFor(null);
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

  // Helper to get progress percentage for any sub-goal type
  const getSubGoalProgress = (sg: Goal): number => {
    if (sg.goalType === 'reading' && sg.totalPages) {
      return Math.min(Math.round(((sg.currentPage ?? 0) / sg.totalPages) * 100), 100);
    }
    if (sg.targetValue > 0) {
      return Math.min(Math.round((sg.currentValue / sg.targetValue) * 100), 100);
    }
    return 0;
  };

  // Helper to get progress text for any sub-goal type
  const getSubGoalProgressText = (sg: Goal): string => {
    if (sg.goalType === 'reading' && sg.totalPages) {
      return `${sg.currentPage ?? 0}/${sg.totalPages} pg`;
    }
    if (sg.goalType === 'frequency') {
      return `${sg.currentValue}/${sg.targetValue} ${sg.frequencyPeriod || 'times'}`;
    }
    return `${sg.currentValue}/${sg.targetValue} ${sg.unit || ''}`;
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
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowEditGoal(true)}
                className="text-xs text-gray-500 hover:text-accent-blue flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="text-xs text-gray-500 hover:text-accent-red"
              >
                Archive
              </button>
            </div>
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

          {goal.goalType === 'numeric' && (
            <div className="text-sm text-gray-400">
              <span className="font-mono text-gray-100">{goal.currentValue}</span> of{' '}
              <span className="font-mono text-gray-100">{goal.targetValue}</span> {goal.unit}
            </div>
          )}

          {hasSubGoals && (
            <div className="text-sm text-gray-400 mt-2 pt-2 border-t border-surface-500">
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

        {/* Sub-Goals Section (available for all goal types) */}
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
                Add a sub-goal to break down this goal
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {subGoals.map((sg) => {
                const isComplete = sg.goalType === 'numeric' || sg.goalType === 'reading'
                  ? sg.currentValue >= sg.targetValue || (sg.currentPage ?? 0) >= (sg.totalPages ?? 1)
                  : sg.currentValue >= sg.targetValue;
                const sgPercent = getSubGoalProgress(sg);
                const sgTypeIcon = sg.goalType === 'reading' ? '📖' : sg.goalType === 'frequency' ? '🔄' : '📊';

                return (
                  <Link
                    key={sg.id}
                    to={`/goals/${sg.id}`}
                    className={`block bg-surface-700 rounded-lg p-3 hover:bg-surface-600 transition-colors ${isComplete ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm">{sgTypeIcon}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm ${isComplete ? 'text-gray-500 line-through' : 'text-gray-100'}`}>
                            {sg.title}
                          </span>
                          <span className="font-mono text-xs text-gray-400">
                            {getSubGoalProgressText(sg)}
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
                  </Link>
                );
              })}
            </div>
          )}
        </div>

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

        {/* Habit Goal: Did it / Didn't buttons */}
        {goal.goalType === 'frequency' && (
          <div className="space-y-3">
            {!showHabitNoteFor ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowHabitNoteFor('did')}
                  disabled={logProgress.isPending}
                  className="py-4 rounded-lg bg-accent-green/20 border-2 border-accent-green text-accent-green font-medium hover:bg-accent-green/30 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Did it
                </button>
                <button
                  onClick={() => setShowHabitNoteFor('didnt')}
                  disabled={logProgress.isPending}
                  className="py-4 rounded-lg bg-accent-red/20 border-2 border-accent-red text-accent-red font-medium hover:bg-accent-red/30 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Didn't
                </button>
              </div>
            ) : (
              <div className="bg-surface-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  {showHabitNoteFor === 'did' ? (
                    <span className="text-accent-green flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Completed
                    </span>
                  ) : (
                    <span className="text-accent-red flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Missed
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={habitNote}
                  onChange={(e) => setHabitNote(e.target.value)}
                  placeholder="Add a note (optional)..."
                  className="w-full"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHabitNoteFor(null);
                      setHabitNote('');
                    }}
                    className="btn btn-ghost flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHabitLog(showHabitNoteFor === 'did' ? 1 : 0)}
                    disabled={logProgress.isPending}
                    className={`btn flex-1 ${showHabitNoteFor === 'did' ? 'bg-accent-green hover:bg-green-600' : 'bg-accent-red hover:bg-red-600'} text-white`}
                  >
                    {logProgress.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Log Progress Button (for non-frequency goals) */}
        {goal.goalType !== 'frequency' && !showLogForm && (
          <button
            onClick={() => setShowLogForm(true)}
            className="w-full btn btn-primary py-3 text-base"
          >
            + Log Progress
          </button>
        )}

        {/* Log Form (for non-frequency goals) */}
        {goal.goalType !== 'frequency' && showLogForm && (
          <form onSubmit={handleLogSubmit} className="bg-surface-700 rounded-lg p-4 space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {goal.goalType === 'reading' 
                  ? 'Current Page' 
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Progress History
            </h2>

            {/* Filter buttons for frequency goals */}
            {goal.goalType === 'frequency' && (
              <div className="flex gap-1">
                <button
                  onClick={() => setHistoryFilter(historyFilter === 'positive' ? null : 'positive')}
                  className={`py-1 px-2 rounded text-xs font-medium transition-colors flex items-center gap-1
                    ${historyFilter === 'positive' 
                      ? 'bg-accent-green/20 text-accent-green' 
                      : 'bg-surface-700 text-gray-500 hover:bg-surface-600'}`}
                  title="Filter completed only"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {logs.filter(l => l.value === 1).length}
                </button>
                <button
                  onClick={() => setHistoryFilter(historyFilter === 'negative' ? null : 'negative')}
                  className={`py-1 px-2 rounded text-xs font-medium transition-colors flex items-center gap-1
                    ${historyFilter === 'negative' 
                      ? 'bg-accent-red/20 text-accent-red' 
                      : 'bg-surface-700 text-gray-500 hover:bg-surface-600'}`}
                  title="Filter missed only"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {logs.filter(l => l.value === 0).length}
                </button>
              </div>
            )}
          </div>
          
          {(() => {
            // Filter logs for frequency goals based on selected filter (null = show all)
            const filteredLogs = goal.goalType === 'frequency' && historyFilter !== null
              ? logs.filter(l => historyFilter === 'positive' ? l.value === 1 : l.value === 0)
              : logs;

            if (logs.length === 0) {
              return (
                <div className="bg-surface-700 rounded-lg p-4 text-center text-gray-500 text-sm">
                  No logs yet. Start tracking your progress!
                </div>
              );
            }

            if (filteredLogs.length === 0) {
              return (
                <div className="bg-surface-700 rounded-lg p-4 text-center text-gray-500 text-sm">
                  {historyFilter === 'positive' ? 'No completed entries yet.' : 'No missed entries. Great job!'}
                </div>
              );
            }

            return (
              <div className="space-y-2">
                {filteredLogs.map((log, index) => {
                  const prevLog = filteredLogs[index + 1];
                  const diff = prevLog ? log.value - prevLog.value : null;
                  const isPositive = log.value === 1;
                  
                  return (
                    <div 
                      key={log.id} 
                      onClick={() => setEditingLog(log)}
                      className={`bg-surface-700 rounded-lg p-3 flex items-center justify-between cursor-pointer hover:bg-surface-600 transition-colors ${
                        goal.goalType === 'frequency' 
                          ? `border-l-4 ${isPositive ? 'border-accent-green' : 'border-accent-red'}`
                          : ''
                      }`}
                    >
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
                      <div className="text-right flex items-center gap-2">
                        {goal.goalType === 'frequency' ? (
                          <div className={`text-sm font-medium ${isPositive ? 'text-accent-green' : 'text-accent-red'}`}>
                            {isPositive ? '✓ Done' : '✗ Missed'}
                          </div>
                        ) : (
                          <>
                            <div className="font-mono text-gray-100">
                              {log.value}
                              {goal.goalType === 'reading' && <span className="text-xs text-gray-500"> pg</span>}
                            </div>
                            {diff !== null && diff !== 0 && (
                              <div className={`text-xs font-mono ${diff > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                                {diff > 0 ? '+' : ''}{diff}
                              </div>
                            )}
                          </>
                        )}
                        <span className="text-gray-600 text-xs">✎</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
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

      {/* Edit Goal Modal */}
      {showEditGoal && (
        <GoalFormModal 
          goal={goal}
          onClose={() => setShowEditGoal(false)} 
        />
      )}

      {/* Edit Log Modal */}
      {editingLog && (
        <GoalLogEditModal
          log={editingLog}
          goal={goal}
          onClose={() => setEditingLog(null)}
        />
      )}
    </div>
  );
}
