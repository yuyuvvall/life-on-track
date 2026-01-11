import { useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useTodayWorkLog, useCreateWorkLog } from '@/hooks';

export function IntegrityModal() {
  const { integrityModalOpen, closeIntegrityModal } = useUIStore();
  const { data: todayLog } = useTodayWorkLog();
  const createWorkLog = useCreateWorkLog();

  const [score, setScore] = useState<0 | 1 | null>(null);
  const [successNote, setSuccessNote] = useState('');
  const [missedNote, setMissedNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (score === null) return;

    const today = new Date().toISOString().split('T')[0];
    createWorkLog.mutate(
      {
        logDate: today,
        integrityScore: score,
        missedOpportunityNote: missedNote.trim() || undefined,
        successNote: successNote.trim() || undefined,
      },
      {
        onSuccess: () => {
          closeIntegrityModal();
          setScore(null);
          setSuccessNote('');
          setMissedNote('');
        },
      }
    );
  };

  const handleSkip = () => {
    if (score === null) return;
    const today = new Date().toISOString().split('T')[0];
    createWorkLog.mutate(
      {
        logDate: today,
        integrityScore: score,
      },
      {
        onSuccess: () => {
          closeIntegrityModal();
          setScore(null);
          setSuccessNote('');
          setMissedNote('');
        },
      }
    );
  };

  // Don't show if already logged today
  if (!integrityModalOpen || (todayLog?.integrityScore !== null && todayLog?.integrityScore !== undefined)) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={closeIntegrityModal}
    >
      <div 
        className="bg-surface-800 w-full max-w-sm rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-100 text-center mb-1">
          Daily Integrity Check
        </h2>
        <p className="text-xs text-gray-500 text-center mb-6">
          Did you maintain work integrity today?
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Score selection */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setScore(1)}
              className={`flex-1 py-4 rounded-xl font-mono text-2xl font-bold transition-all
                ${score === 1 
                  ? 'bg-accent-green text-white ring-2 ring-accent-green ring-offset-2 ring-offset-surface-800' 
                  : 'bg-accent-green/20 text-accent-green hover:bg-accent-green/30'}`}
            >
              1
            </button>
            <button
              type="button"
              onClick={() => setScore(0)}
              className={`flex-1 py-4 rounded-xl font-mono text-2xl font-bold transition-all
                ${score === 0 
                  ? 'bg-accent-red text-white ring-2 ring-accent-red ring-offset-2 ring-offset-surface-800' 
                  : 'bg-accent-red/20 text-accent-red hover:bg-accent-red/30'}`}
            >
              0
            </button>
          </div>

          <div className="flex justify-between text-xs text-gray-500 px-2">
            <span>Success</span>
            <span>Missed</span>
          </div>

          {/* Dual note inputs - both optional */}
          {score !== null && (
            <div className="space-y-3">
              <div className={`text-sm font-medium text-center ${score === 1 ? 'text-accent-green' : 'text-accent-red'}`}>
                {score === 1 ? '✓ Success Day' : '✗ Missed Opportunity'}
              </div>
              
              {/* Positive notes */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  What went well? (optional)
                </label>
                <textarea
                  value={successNote}
                  onChange={(e) => setSuccessNote(e.target.value)}
                  placeholder="Wins, achievements..."
                  className="w-full h-16 text-sm resize-none"
                />
              </div>
              
              {/* Negative notes */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  What could improve? (optional)
                </label>
                <textarea
                  value={missedNote}
                  onChange={(e) => setMissedNote(e.target.value)}
                  placeholder="Missed opportunities..."
                  className="w-full h-16 text-sm resize-none"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeIntegrityModal}
              className="btn btn-ghost flex-1"
            >
              Later
            </button>
            {score !== null && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={createWorkLog.isPending}
                className="btn btn-ghost flex-1"
              >
                Skip
              </button>
            )}
            <button
              type="submit"
              disabled={score === null || createWorkLog.isPending}
              className="btn btn-primary flex-1"
            >
              {createWorkLog.isPending ? 'Saving...' : 'Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

