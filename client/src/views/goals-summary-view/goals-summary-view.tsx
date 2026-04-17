import { useState } from 'react';
import { useGoals, useDeleteGoal } from '@/hooks';
import { GoalFormModal } from '@/components/goal-form-modal';
import GoalSection from './goal-section';
import './goals-summary-view.less';

const GoalsSummaryView = () => {
  const { data: goals, isLoading } = useGoals();
  const deleteGoal = useDeleteGoal();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleDelete = (id: string) => {
    if (confirm('Archive this goal?')) {
      deleteGoal.mutate(id);
    }
  };

  const readingGoals = goals?.filter(g => g.goalType === 'reading') || [];
  const frequencyGoals = goals?.filter(g => g.goalType === 'frequency') || [];
  const numericGoals = goals?.filter(g => g.goalType === 'numeric') || [];

  if (isLoading) {
    return (
      <div className="goals-summary-view goals-summary-view--loading">
        <div className="goals-summary-view__loading-text">Loading goals...</div>
      </div>
    );
  }

  return (
    <div className="goals-summary-view">
      <header className="goals-summary-view__header">
        <div className="goals-summary-view__header-inner">
          <div className="goals-summary-view__header-row">
            <div>
              <h1 className="goals-summary-view__title">Goals Tracker</h1>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              + New Goal
            </button>
          </div>
        </div>
      </header>

      <main className="goals-summary-view__main">
        <div className="goals-summary-view__stats-grid">
          <div className="goals-summary-view__stat">
            <div className="goals-summary-view__stat-value goals-summary-view__stat-value--blue">
              {goals?.length || 0}
            </div>
            <div className="goals-summary-view__stat-label">Active Goals</div>
          </div>
          <div className="goals-summary-view__stat">
            <div className="goals-summary-view__stat-value goals-summary-view__stat-value--green">
              {readingGoals.length}
            </div>
            <div className="goals-summary-view__stat-label">Reading</div>
          </div>
          <div className="goals-summary-view__stat">
            <div className="goals-summary-view__stat-value goals-summary-view__stat-value--amber">
              {frequencyGoals.length}
            </div>
            <div className="goals-summary-view__stat-label">Habits</div>
          </div>
        </div>

        {readingGoals.length > 0 && (
          <GoalSection
            title="Reading Goals"
            icon="📚"
            goals={readingGoals}
            onDelete={handleDelete}
          />
        )}

        {frequencyGoals.length > 0 && (
          <GoalSection
            title="Habits & Frequency"
            icon="🔄"
            goals={frequencyGoals}
            onDelete={handleDelete}
          />
        )}

        {numericGoals.length > 0 && (
          <GoalSection
            title="Numeric Goals"
            icon="📊"
            goals={numericGoals}
            onDelete={handleDelete}
          />
        )}

        {(!goals || goals.length === 0) && (
          <div className="goals-summary-view__empty">
            <div className="goals-summary-view__empty-icon">🎯</div>
            <div className="goals-summary-view__empty-text">No goals yet</div>
            <div className="goals-summary-view__empty-hint">
              Create your first goal to start tracking progress
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              Create Goal
            </button>
          </div>
        )}
      </main>

      {showCreateModal && (
        <GoalFormModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
};

export default GoalsSummaryView;
