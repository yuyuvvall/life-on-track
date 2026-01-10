import { useState } from 'react';
import { useCreateGoal, useUpdateGoal } from '@/hooks';
import type { Goal, GoalType, FrequencyPeriod } from '@/types';

interface GoalFormModalProps {
  onClose: () => void;
  parentId?: string;
  parentTitle?: string;
  goal?: Goal; // If provided, we're in edit mode
}

export function GoalFormModal({ onClose, parentId, parentTitle, goal }: GoalFormModalProps) {
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  
  const isEditMode = !!goal;
  
  const [title, setTitle] = useState(goal?.title || '');
  const [goalType, setGoalType] = useState<GoalType>(goal?.goalType || 'frequency');
  const [targetValue, setTargetValue] = useState(goal?.targetValue?.toString() || '');
  const [unit, setUnit] = useState(goal?.unit || '');
  const [totalPages, setTotalPages] = useState(goal?.totalPages?.toString() || '');
  const [frequencyPeriod, setFrequencyPeriod] = useState<FrequencyPeriod>(goal?.frequencyPeriod || 'weekly');
  const [targetDate, setTargetDate] = useState(goal?.targetDate?.split('T')[0] || '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);

        try {
      if (isEditMode && goal) {
        await updateGoal.mutateAsync({
          id: goal.id,
          data: {
            title: title.trim(),
            targetValue: parseInt(targetValue) || 0,
            unit: unit || undefined,
            totalPages: goalType === 'reading' ? parseInt(totalPages) || undefined : undefined,
            targetDate: targetDate || undefined,
          },
        });
      } else {
        await createGoal.mutateAsync({
          title: title.trim(),
          goalType,
          targetValue: parseInt(targetValue) || 0,
          unit: unit || undefined,
          totalPages: goalType === 'reading' ? parseInt(totalPages) || undefined : undefined,
          frequencyPeriod: goalType === 'frequency' ? frequencyPeriod : undefined,
          targetDate: targetDate || undefined,
          parentId: parentId || undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditMode ? 'Failed to update goal' : 'Failed to create goal');
    }
  };

  const isSubGoal = !!parentId;
  const isPending = createGoal.isPending || updateGoal.isPending;

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-surface-800 w-full max-w-md rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-100 mb-1">
          {isEditMode ? 'Edit Goal' : isSubGoal ? 'Add Sub-Goal' : 'Create New Goal'}
        </h2>
        {isSubGoal && parentTitle && (
          <p className="text-xs text-gray-500 mb-4">Under: {parentTitle}</p>
        )}

        {error && (
          <div className="bg-accent-red/20 border border-accent-red/50 rounded-lg p-3 mb-4 text-sm text-accent-red">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Goal Type - available for all goals including sub-goals, but not editable */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">
              Goal Type {isEditMode && <span className="text-gray-600">(cannot be changed)</span>}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'reading' as const, icon: '📖', label: 'Reading' },
                { type: 'frequency' as const, icon: '🔄', label: 'Habit' },
                { type: 'numeric' as const, icon: '📊', label: 'Numeric' },
              ].map(({ type, icon, label }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => !isEditMode && setGoalType(type)}
                  disabled={isEditMode}
                  className={`py-3 rounded-lg text-center transition-colors
                    ${goalType === type 
                      ? 'bg-accent-blue text-white' 
                      : 'bg-surface-600 text-gray-300 hover:bg-surface-500'}
                    ${isEditMode ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <div className="text-xl mb-1">{icon}</div>
                  <div className="text-xs">{label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {goalType === 'reading' ? 'Book Title' : isSubGoal ? 'Sub-Goal Name' : 'Goal Name'}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                goalType === 'reading' 
                  ? 'e.g., Atomic Habits' 
                  : isSubGoal 
                    ? 'e.g., Bench Press' 
                    : 'e.g., Go to the gym'
              }
              className="w-full"
              autoFocus
            />
          </div>

          {/* Reading-specific fields */}
          {goalType === 'reading' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Total Pages</label>
              <input
                type="number"
                value={totalPages}
                onChange={(e) => setTotalPages(e.target.value)}
                placeholder="e.g., 320"
                className="w-full"
              />
            </div>
          )}

          {/* Frequency-specific fields */}
          {goalType === 'frequency' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Target Times</label>
                  <input
                    type="number"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    placeholder="e.g., 4"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Period</label>
                  <select
                    value={frequencyPeriod}
                    onChange={(e) => setFrequencyPeriod(e.target.value as FrequencyPeriod)}
                    className="w-full"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Unit (optional)</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g., sessions, times"
                  className="w-full"
                />
              </div>
            </>
          )}

          {/* Numeric-specific fields */}
          {goalType === 'numeric' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Target Value</label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="e.g., 100"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Unit</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g., kg, reps"
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Target Date (optional) */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Target Date (optional)</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Actions */}
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
              disabled={!title.trim() || isPending}
              className="btn btn-primary flex-1"
            >
              {isPending 
                ? (isEditMode ? 'Saving...' : 'Creating...') 
                : isEditMode 
                  ? 'Save Changes' 
                  : isSubGoal 
                    ? 'Add Sub-Goal' 
                    : 'Create Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
