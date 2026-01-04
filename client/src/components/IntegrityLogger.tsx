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
  const [note, setNote] = useState('');
  const [pendingScore, setPendingScore] = useState<0 | 1 | null>(null);

  // Reset note when log changes
  useEffect(() => {
    if (todayLog) {
      setNote(todayLog.missedOpportunityNote || todayLog.successNote || '');
    }
  }, [todayLog]);

  const handleScoreSelect = (score: 0 | 1) => {
    if (score === 0) {
      // Force note input for failed day
      setPendingScore(0);
      setShowNoteInput(true);
      setNote('');
    } else {
      // Submit immediately for success
      submitScore(score, undefined);
    }
  };

  const submitScore = (score: 0 | 1, missedNote?: string) => {
    const today = new Date().toISOString().split('T')[0];

    if (todayLog) {
      updateWorkLog.mutate({
        id: todayLog.id,
        data: {
          integrityScore: score,
          missedOpportunityNote: score === 0 ? missedNote : undefined,
          successNote: score === 1 ? note || undefined : undefined,
        },
      });
    } else {
      createWorkLog.mutate({
        logDate: today,
        integrityScore: score,
        missedOpportunityNote: score === 0 ? missedNote : undefined,
        successNote: score === 1 ? note || undefined : undefined,
      });
    }

    setShowNoteInput(false);
    setPendingScore(null);
  };

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingScore === 0 && !note.trim()) return;
    submitScore(pendingScore ?? 0, note.trim());
  };

  const handleCancel = () => {
    setShowNoteInput(false);
    setPendingScore(null);
    setNote('');
  };

  if (isLoading) {
    return <div className="h-16 bg-surface-700 rounded-lg animate-pulse" />;
  }

  const hasLoggedToday = todayLog?.integrityScore !== null && todayLog?.integrityScore !== undefined;

  // Compact mode with note input support
  if (compact) {
    // Show note input form when "0" was selected
    if (showNoteInput && pendingScore === 0) {
      return (
        <div className="bg-surface-700 rounded-lg p-3">
          <form onSubmit={handleNoteSubmit} className="space-y-2">
            <div className="text-xs text-accent-red font-medium">
              What opportunity did you miss today?
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reflect on what went wrong..."
              className="w-full h-16 text-sm resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="btn btn-ghost flex-1 text-xs py-1.5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!note.trim() || createWorkLog.isPending || updateWorkLog.isPending}
                className="btn btn-primary flex-1 text-xs py-1.5"
              >
                {createWorkLog.isPending || updateWorkLog.isPending ? 'Saving...' : 'Log'}
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
          {(todayLog.missedOpportunityNote || todayLog.successNote) && (
            <div className="mt-2 text-xs text-gray-500 italic">
              "{todayLog.missedOpportunityNote || todayLog.successNote}"
            </div>
          )}
        </div>
      ) : showNoteInput ? (
        <form onSubmit={handleNoteSubmit} className="space-y-3">
          <div className="text-sm text-accent-red">
            What opportunity did you miss today?
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reflect on what went wrong..."
            className="w-full h-20 text-sm resize-none"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="btn btn-ghost flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!note.trim() || createWorkLog.isPending || updateWorkLog.isPending}
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
