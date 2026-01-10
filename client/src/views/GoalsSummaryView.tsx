import { useState } from 'react';
import { useGoals, useDeleteGoal } from '@/hooks';
import { GoalCard } from '@/components/GoalCard';
import { GoalFormModal } from '@/components/GoalFormModal';
import type { Goal } from '@/types';

export function GoalsSummaryView() {
  const { data: goals, isLoading } = useGoals();
  const deleteGoal = useDeleteGoal();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleDelete = (id: string) => {
    if (confirm('Archive this goal?')) {
      deleteGoal.mutate(id);
    }
  };

  // Group goals by type
  const readingGoals = goals?.filter(g => g.goalType === 'reading') || [];
  const frequencyGoals = goals?.filter(g => g.goalType === 'frequency') || [];
  const numericGoals = goals?.filter(g => g.goalType === 'numeric') || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-gray-500">Loading goals...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-surface-900/95 backdrop-blur-sm border-b border-surface-700">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-100 mt-1">
                Goals Tracker
              </h1>
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

      <main className="px-4 py-4 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface-700 rounded-lg p-3 text-center">
            <div className="text-2xl font-mono font-bold text-accent-blue">
              {goals?.length || 0}
            </div>
            <div className="text-xs text-gray-500">Active Goals</div>
          </div>
          <div className="bg-surface-700 rounded-lg p-3 text-center">
            <div className="text-2xl font-mono font-bold text-accent-green">
              {readingGoals.length}
            </div>
            <div className="text-xs text-gray-500">Reading</div>
          </div>
          <div className="bg-surface-700 rounded-lg p-3 text-center">
            <div className="text-2xl font-mono font-bold text-accent-amber">
              {frequencyGoals.length}
            </div>
            <div className="text-xs text-gray-500">Habits</div>
          </div>
        </div>

        {/* Reading Goals */}
        {readingGoals.length > 0 && (
          <GoalSection 
            title="Reading Goals" 
            icon="📚"
            goals={readingGoals} 
            onDelete={handleDelete}
          />
        )}

        {/* Frequency/Habit Goals */}
        {frequencyGoals.length > 0 && (
          <GoalSection 
            title="Habits & Frequency" 
            icon="🔄"
            goals={frequencyGoals} 
            onDelete={handleDelete}
          />
        )}

        {/* Numeric Goals */}
        {numericGoals.length > 0 && (
          <GoalSection 
            title="Numeric Goals" 
            icon="📊"
            goals={numericGoals} 
            onDelete={handleDelete}
          />
        )}

        {/* Empty state */}
        {(!goals || goals.length === 0) && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">🎯</div>
            <div className="text-gray-400 mb-2">No goals yet</div>
            <div className="text-gray-600 text-sm mb-4">
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

      {/* Create Modal */}
      {showCreateModal && (
        <GoalFormModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

interface GoalSectionProps {
  title: string;
  icon: string;
  goals: Goal[];
  onDelete: (id: string) => void;
}

function GoalSection({ title, icon, goals, onDelete }: GoalSectionProps) {
  return (
    <section>
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span>{icon}</span>
        {title}
        <span className="text-gray-600">({goals.length})</span>
      </h2>
      <div className="space-y-3">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

