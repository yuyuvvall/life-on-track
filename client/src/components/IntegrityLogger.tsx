import { useState, useEffect } from 'react';
import { useTodayWorkLog, useCreateWorkLog, useUpdateWorkLog } from '@/hooks';

interface IntegrityLoggerProps {
  compact?: boolean;
}

export function IntegrityLogger({ compact = false }: IntegrityLoggerProps) {
  const { data: todayLog, isLoading } = useTodayWorkLog();
  const createWorkLog = useCreateWorkLog();
  const updateWorkLog = useUpdateWorkLog();

  const [showNoteInput, setShowNoteInput] = useState(false);
  const [successNote, setSuccessNote] = useState('');
  const [missedNote, setMissedNote] = useState('');
  const [pendingScore, setPendingScore] = useState<0 | 1 | null>(null);

  // Reset notes when log changes
  useEffect(() => {
    if (todayLog) {
      setSuccessNote(todayLog.successNote || '');
      setMissedNote(todayLog.missedOpportunityNote || '');
    }
  }, [todayLog]);

  const handleScoreSelect = (score: 0 | 1) => {
    // Always show note input form for both scores
    setPendingScore(score);
    setShowNoteInput(true);
    setSuccessNote('');
    setMissedNote('');
  };

  const submitScore = (score: 0 | 1, successNoteVal?: string, missedNoteVal?: string) => {
    const today = new Date().toISOString().split('T')[0];

    if (todayLog) {
      updateWorkLog.mutate({
        id: todayLog.id,
        data: {
          integrityScore: score,
          missedOpportunityNote: missedNoteVal || undefined,
          successNote: successNoteVal || undefined,
        },
      });
    } else {
      createWorkLog.mutate({
        logDate: today,
        integrityScore: score,
        missedOpportunityNote: missedNoteVal || undefined,
        successNote: successNoteVal || undefined,
      });
    }

    setShowNoteInput(false);
    setPendingScore(null);
  };

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingScore === null) return;
    submitScore(pendingScore, successNote.trim(), missedNote.trim());
  };

  const handleSkip = () => {
    if (pendingScore === null) return;
    submitScore(pendingScore);
  };

  const handleCancel = () => {
    setShowNoteInput(false);
    setPendingScore(null);
    setSuccessNote('');
    setMissedNote('');
  };

  if (isLoading) {
    return <div className="h-16 bg-surface-700 rounded-lg animate-pulse" />;
  }

  const hasLoggedToday = todayLog?.integrityScore !== null && todayLog?.integrityScore !== undefined;

  // Compact mode with note input support
  if (compact) {
    // Show dual note input form when score was selected
    if (showNoteInput && pendingScore !== null) {
      return (
        <div className="bg-surface-700 rounded-lg p-3">
          <form onSubmit={handleNoteSubmit} className="space-y-2">
            <div className={`text-xs font-medium ${pendingScore === 1 ? 'text-accent-green' : 'text-accent-red'}`}>
              {pendingScore === 1 ? '✓ Success Day' : '✗ Missed Opportunity'}
            </div>
            
            {/* Positive notes */}
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">What went well? (optional)</label>
              <textarea
                value={successNote}
                onChange={(e) => setSuccessNote(e.target.value)}
                placeholder="Wins, achievements..."
                className="w-full h-12 text-sm resize-none"
              />
            </div>
            
            {/* Negative notes */}
            <div>
              <label className="block text-[10px] text-gray-500 mb-0.5">What could improve? (optional)</label>
              <textarea
                value={missedNote}
                onChange={(e) => setMissedNote(e.target.value)}
                placeholder="Missed opportunities..."
                className="w-full h-12 text-sm resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="btn btn-ghost flex-1 text-xs py-1.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={createWorkLog.isPending || updateWorkLog.isPending}
                className="btn btn-ghost flex-1 text-xs py-1.5"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={createWorkLog.isPending || updateWorkLog.isPending}
                className="btn btn-primary flex-1 text-xs py-1.5"
              >
                {createWorkLog.isPending || updateWorkLog.isPending ? '...' : 'Log'}
              </button>
            </div>
          </form>
        </div>
      );
    }

    return (
      <div className="bg-surface-700 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Today's Integrity</div>
            {hasLoggedToday ? (
              <div className={`font-mono text-lg ${todayLog.integrityScore === 1 ? 'text-accent-green' : 'text-accent-red'}`}>
                {todayLog.integrityScore === 1 ? '✓ Success' : '✗ Missed'}
              </div>
            ) : (
              <div className="text-gray-400 text-sm">Not logged</div>
            )}
          </div>
          
          {!hasLoggedToday && (
            <div className="flex gap-2">
              <button
                onClick={() => handleScoreSelect(1)}
                disabled={createWorkLog.isPending}
                className="integrity-btn integrity-btn-success"
              >
                1
              </button>
              <button
                onClick={() => handleScoreSelect(0)}
                className="integrity-btn integrity-btn-fail"
              >
                0
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Full mode
  return (
    <div className="bg-surface-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-300">Work Integrity</h3>
        <span className="text-xs text-gray-500 font-mono">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
      </div>

      {hasLoggedToday ? (
        <div className="text-center py-2">
          <div className={`text-3xl mb-1 ${todayLog.integrityScore === 1 ? 'text-accent-green' : 'text-accent-red'}`}>
            {todayLog.integrityScore === 1 ? '✓' : '✗'}
          </div>
          <div className="text-sm text-gray-400">
            {todayLog.integrityScore === 1 ? 'Productive day logged' : 'Missed opportunity logged'}
          </div>
          {/* Show both notes if they exist */}
          {todayLog.successNote && (
            <div className="mt-2 text-xs text-accent-green/80 italic text-left">
              ✓ "{todayLog.successNote}"
            </div>
          )}
          {todayLog.missedOpportunityNote && (
            <div className="mt-2 text-xs text-accent-red/80 italic text-left">
              ✗ "{todayLog.missedOpportunityNote}"
            </div>
          )}
        </div>
      ) : showNoteInput ? (
        <form onSubmit={handleNoteSubmit} className="space-y-3">
          <div className={`text-sm font-medium ${pendingScore === 1 ? 'text-accent-green' : 'text-accent-red'}`}>
            {pendingScore === 1 ? '✓ Logging Success Day' : '✗ Logging Missed Opportunity'}
          </div>
          
          {/* Positive notes */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">What went well? (optional)</label>
            <textarea
              value={successNote}
              onChange={(e) => setSuccessNote(e.target.value)}
              placeholder="Wins, achievements, good decisions..."
              className="w-full h-16 text-sm resize-none"
            />
          </div>
          
          {/* Negative notes */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">What could improve? (optional)</label>
            <textarea
              value={missedNote}
              onChange={(e) => setMissedNote(e.target.value)}
              placeholder="Missed opportunities, things to work on..."
              className="w-full h-16 text-sm resize-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="btn btn-ghost flex-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={createWorkLog.isPending || updateWorkLog.isPending}
              className="btn btn-ghost flex-1"
            >
              Skip Notes
            </button>
            <button
              type="submit"
              disabled={createWorkLog.isPending || updateWorkLog.isPending}
              className="btn btn-primary flex-1"
            >
              {createWorkLog.isPending || updateWorkLog.isPending ? 'Saving...' : 'Log'}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex justify-center gap-4">
          <button
            onClick={() => handleScoreSelect(1)}
            disabled={createWorkLog.isPending}
            className="flex-1 integrity-btn integrity-btn-success h-14 rounded-xl"
          >
            <span className="text-2xl">1</span>
          </button>
          <button
            onClick={() => handleScoreSelect(0)}
            className="flex-1 integrity-btn integrity-btn-fail h-14 rounded-xl"
          >
            <span className="text-2xl">0</span>
          </button>
        </div>
      )}
    </div>
  );
}
