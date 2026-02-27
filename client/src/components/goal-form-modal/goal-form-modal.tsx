import { useState } from 'react';
import { useCreateGoal, useUpdateGoal } from '@/hooks';
import type { Goal, GoalType, FrequencyPeriod } from '@/types';
import './goal-form-modal.less';

export type GoalFormModalProps = {
  onClose: () => void;
  parentId?: string;
  parentTitle?: string;
  goal?: Goal;
};

const GoalFormModal = ({ onClose, parentId, parentTitle, goal }: GoalFormModalProps) => {
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

  const goalTypes = [
    { type: 'reading' as const, icon: '📖', label: 'Reading' },
    { type: 'frequency' as const, icon: '🔄', label: 'Habit' },
    { type: 'numeric' as const, icon: '📊', label: 'Numeric' },
  ];

  return (
    <div className="goal-form-modal" onClick={onClose}>
      <div className="goal-form-modal__card" onClick={(e) => e.stopPropagation()}>
        <h2 className="goal-form-modal__title">
          {isEditMode ? 'Edit Goal' : isSubGoal ? 'Add Sub-Goal' : 'Create New Goal'}
        </h2>
        {isSubGoal && parentTitle && (
          <p className="goal-form-modal__subtitle">Under: {parentTitle}</p>
        )}

        {error && (
          <div className="goal-form-modal__error">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="goal-form-modal__form">
          <div>
            <label className="goal-form-modal__label">
              Goal Type {isEditMode && <span className="goal-form-modal__label--muted">(cannot be changed)</span>}
            </label>
            <div className="goal-form-modal__type-grid">
              {goalTypes.map(({ type, icon, label }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => !isEditMode && setGoalType(type)}
                  disabled={isEditMode}
                  className={`goal-form-modal__type-btn${
                    goalType === type ? ' goal-form-modal__type-btn--active' : ''
                  }${isEditMode ? ' goal-form-modal__type-btn--disabled' : ''}`}
                >
                  <div className="goal-form-modal__type-icon">{icon}</div>
                  <div className="goal-form-modal__type-label">{label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="goal-form-modal__label">
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
              className="goal-form-modal__input"
              autoFocus
            />
          </div>

          {goalType === 'reading' && (
            <div>
              <label className="goal-form-modal__label">Total Pages</label>
              <input
                type="number"
                value={totalPages}
                onChange={(e) => setTotalPages(e.target.value)}
                placeholder="e.g., 320"
                className="goal-form-modal__input"
              />
            </div>
          )}

          {goalType === 'frequency' && (
            <>
              <div className="goal-form-modal__row">
                <div>
                  <label className="goal-form-modal__label">Target Times</label>
                  <input
                    type="number"
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    placeholder="e.g., 4"
                    className="goal-form-modal__input"
                  />
                </div>
                <div>
                  <label className="goal-form-modal__label">Period</label>
                  <select
                    value={frequencyPeriod}
                    onChange={(e) => setFrequencyPeriod(e.target.value as FrequencyPeriod)}
                    className="goal-form-modal__input"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="goal-form-modal__label">Unit (optional)</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g., sessions, times"
                  className="goal-form-modal__input"
                />
              </div>
            </>
          )}

          {goalType === 'numeric' && (
            <div className="goal-form-modal__row">
              <div>
                <label className="goal-form-modal__label">Target Value</label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder="e.g., 100"
                  className="goal-form-modal__input"
                />
              </div>
              <div>
                <label className="goal-form-modal__label">Unit</label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g., kg, reps"
                  className="goal-form-modal__input"
                />
              </div>
            </div>
          )}

          <div>
            <label className="goal-form-modal__label">Target Date (optional)</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="goal-form-modal__input"
            />
          </div>

          <div className="goal-form-modal__actions">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost goal-form-modal__action-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isPending}
              className="btn btn-primary goal-form-modal__action-btn"
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
};

export default GoalFormModal;
