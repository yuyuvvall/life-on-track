import type { WorkLog } from '@/types'
import { WEEK_DAY_NAMES } from '@/utils/dateConstants'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons'
import './integrity-heatmap.less'

export type IntegrityHeatmapProps = {
  workLogs: WorkLog[]
  weekStart: string
  onDayClick?: (log: WorkLog | null, date: string) => void
}

const IntegrityHeatmap = ({ workLogs, weekStart, onDayClick }: IntegrityHeatmapProps) => {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + i)
    return date.toISOString().split('T')[0]
  })

  const getLogForDate = (date: string) => {
    return workLogs.find(l => l.logDate === date)
  }

  const successCount = workLogs.filter(l => l.integrityScore === 1).length
  const failCount = workLogs.filter(l => l.integrityScore === 0).length

  const handleDayClick = (date: string) => {
    if (!onDayClick) return
    const log = getLogForDate(date)
    onDayClick(log || null, date)
  }

  return (
    <div className="integrity-heatmap">
      <div className="integrity-heatmap__header">
        <h3 className="integrity-heatmap__title">Integrity Heatmap</h3>
        <div className="integrity-heatmap__stats">
          <span className="integrity-heatmap__stat--success">
            {successCount}
            <FontAwesomeIcon icon={faCheck} className="integrity-heatmap__stat-icon" />
          </span>
          <span className="integrity-heatmap__stat--fail">
            {failCount}
            <FontAwesomeIcon icon={faXmark} className="integrity-heatmap__stat-icon" />
          </span>
        </div>
      </div>

      <div className="integrity-heatmap__grid">
        {days.map((date, i) => {
          const log = getLogForDate(date)
          const score = log?.integrityScore
          const isToday = date === new Date().toISOString().split('T')[0]
          const hasNotes = log?.successNote || log?.missedOpportunityNote
          const isClickable = !!onDayClick && (log !== undefined)

          const cellClasses = [
            'heatmap-cell',
            'integrity-heatmap__cell',
            score === 1 ? 'heatmap-success' : score === 0 ? 'heatmap-fail' : 'heatmap-empty',
            isToday ? 'integrity-heatmap__cell--today' : '',
            hasNotes ? 'integrity-heatmap__cell--has-notes' : '',
            isClickable ? 'integrity-heatmap__cell--clickable' : '',
          ].filter(Boolean).join(' ')

          return (
            <div key={date} className="integrity-heatmap__day">
              <div className="integrity-heatmap__day-label">{WEEK_DAY_NAMES[i]}</div>
              <div
                onClick={() => isClickable && handleDayClick(date)}
                className={cellClasses}
                title={`${date}: ${score === 1 ? 'Success' : score === 0 ? 'Missed' : 'No log'}${hasNotes ? ' (has notes)' : ''}`}
              >
                {score === 1 ? '1' : score === 0 ? '0' : '–'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default IntegrityHeatmap
