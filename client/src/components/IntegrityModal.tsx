import { useState } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useTodayWorkLog, useCreateWorkLog } from '@/hooks';

export function IntegrityModal() {
  const { integrityModalOpen, closeIntegrityModal } = useUIStore();
  const { data: todayLog } = useTodayWorkLog();
  const createWorkLog = useCreateWorkLog();

  const [score, setScore] = useState<0 | 1 | null>(null);
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (score === null) return;
    if (score === 0 && !note.trim()) return;

    const today = new Date().toISOString().split('T')[0];
    createWorkLog.mutate(
      {
        logDate: today,
        integrityScore: score,
        missedOpportunityNote: score === 0 ? note.trim() : undefined,
        successNote: score === 1 ? note.trim() || undefined : undefined,
      },
      {
        onSuccess: () => {
          closeIntegrityModal();
          setScore(null);
          setNote('');
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

          {/* Note input - required for 0, optional for 1 */}
          {score !== null && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {score === 0 ? 'What opportunity did you miss? (required)' : 'Any notes? (optional)'}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={score === 0 ? 'Reflect on what went wrong...' : 'Optional reflection...'}
                className="w-full h-24 text-sm resize-none"
                autoFocus
              />
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
            <button
              type="submit"
              disabled={score === null || (score === 0 && !note.trim()) || createWorkLog.isPending}
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

