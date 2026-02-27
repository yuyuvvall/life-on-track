import { useEffect, useState } from 'react'
import { WeeklyStats } from '@/components/weekly-stats'
import { FocusList } from '@/components/focus-list'
import { IntegrityLogger } from '@/components/integrity-logger'
import { QuickAddFAB } from '@/components/quick-add-fab'
import { WeeklyCalendarView } from '@/components/weekly-calendar-view'
import { useUIStore } from '@/store/uiStore'
import { useTodayWorkLog } from '@/hooks'
import './pulse-dashboard.less'

type FocusView = 'tasks' | 'weekly'

const PulseDashboard = () => {
  const { openIntegrityModal } = useUIStore()
  const { data: todayLog, isLoading } = useTodayWorkLog()
  const [focusView, setFocusView] = useState<FocusView>('tasks')

  useEffect(() => {
    if (isLoading) return

    const hour = new Date().getHours()
    const hasLogged = todayLog?.integrityScore !== null && todayLog?.integrityScore !== undefined

    if (!hasLogged && hour >= 20) {
      const timer = setTimeout(() => {
        openIntegrityModal()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [todayLog, isLoading, openIntegrityModal])

  return (
    <div className="pulse-dashboard">
      <header className="pulse-dashboard__header">
        <div className="pulse-dashboard__header-inner">
          <h1 className="pulse-dashboard__title">The Auditor</h1>
          <WeeklyStats />
        </div>
      </header>

      <main className="pulse-dashboard__main">
        <IntegrityLogger compact />

        <div className="pulse-dashboard__view-toggle">
          <div className="pulse-dashboard__toggle-group">
            <button
              onClick={() => setFocusView('tasks')}
              className={`pulse-dashboard__toggle-btn${
                focusView === 'tasks' ? ' pulse-dashboard__toggle-btn--active' : ''
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => setFocusView('weekly')}
              className={`pulse-dashboard__toggle-btn${
                focusView === 'weekly' ? ' pulse-dashboard__toggle-btn--active' : ''
              }`}
            >
              Weekly
            </button>
          </div>
          {focusView === 'tasks' && (
            <span className="pulse-dashboard__swipe-hint">Swipe right to complete</span>
          )}
        </div>

        {focusView === 'tasks' ? <FocusList /> : <WeeklyCalendarView />}
      </main>

      <QuickAddFAB />
    </div>
  )
}

export default PulseDashboard
