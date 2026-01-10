import { useEffect, useState } from 'react';
import { WeeklyStats } from '@/components/WeeklyStats';
import { FocusList } from '@/components/FocusList';
import { IntegrityLogger } from '@/components/IntegrityLogger';
import { QuickAddFAB } from '@/components/QuickAddFAB';
import { WeeklyCalendarView } from '@/components/WeeklyCalendarView';
import { useUIStore } from '@/store/uiStore';
import { useTodayWorkLog } from '@/hooks';

type FocusView = 'tasks' | 'weekly';

export function PulseDashboard() {
  const { openIntegrityModal } = useUIStore();
  const { data: todayLog, isLoading } = useTodayWorkLog();
  const [focusView, setFocusView] = useState<FocusView>('tasks');

  // Auto-prompt for integrity log if not logged today (after 6 PM)
  useEffect(() => {
    if (isLoading) return;
    
    const hour = new Date().getHours();
    const hasLogged = todayLog?.integrityScore !== null && todayLog?.integrityScore !== undefined;
    
    if (!hasLogged && hour >= 20) {
      // Delay to not interrupt initial page load
      const timer = setTimeout(() => {
        openIntegrityModal();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [todayLog, isLoading, openIntegrityModal]);

  return (
    <div className="min-h-screen bg-surface-900 pb-24">
      {/* Header */}
      <header className="bg-surface-900/95 border-b border-surface-700">
        <div className="px-4 py-3">
          <h1 className="text-lg font-semibold text-gray-100 tracking-tight mb-3">
            The Auditor
          </h1>
          
          {/* Weekly Stats - horizontal scroll */}
          <WeeklyStats />
        </div>
      </header>

      {/* Main content */}
      <main className="px-4 py-4 space-y-4">
        {/* Integrity logger (compact) */}
        <IntegrityLogger compact />
        
        {/* View toggle */}
        <div className="flex items-center justify-between">
          <div className="flex bg-surface-800 rounded-lg p-1">
            <button
              onClick={() => setFocusView('tasks')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                focusView === 'tasks'
                  ? 'bg-surface-700 text-gray-100 shadow-sm'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => setFocusView('weekly')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                focusView === 'weekly'
                  ? 'bg-surface-700 text-gray-100 shadow-sm'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              Weekly
            </button>
          </div>
          {focusView === 'tasks' && (
            <span className="text-xs text-gray-600">
              Swipe right to complete
            </span>
          )}
        </div>

        {/* Conditional view */}
        {focusView === 'tasks' ? <FocusList /> : <WeeklyCalendarView />}
      </main>

      {/* FAB */}
      <QuickAddFAB />
    </div>
  );
}

