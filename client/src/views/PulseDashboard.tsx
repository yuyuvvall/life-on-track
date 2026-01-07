import { useEffect } from 'react';
import { WeeklyStats } from '@/components/WeeklyStats';
import { FocusList } from '@/components/FocusList';
import { IntegrityLogger } from '@/components/IntegrityLogger';
import { QuickAddFAB } from '@/components/QuickAddFAB';
import { useUIStore } from '@/store/uiStore';
import { useTodayWorkLog } from '@/hooks';

export function PulseDashboard() {
  const { openIntegrityModal } = useUIStore();
  const { data: todayLog, isLoading } = useTodayWorkLog();

  // Auto-prompt for integrity log if not logged today (after 6 PM)
  useEffect(() => {
    if (isLoading) return;
    
    const hour = new Date().getHours();
    const hasLogged = todayLog?.integrityScore !== null && todayLog?.integrityScore !== undefined;
    
    if (!hasLogged && hour >= 18) {
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
        
        {/* Focus list header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
            Focus List
          </h2>
          <span className="text-xs text-gray-600">
            Swipe right to complete
          </span>
        </div>

        {/* Task list */}
        <FocusList />
      </main>

      {/* FAB */}
      <QuickAddFAB />
    </div>
  );
}

