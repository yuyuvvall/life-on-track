import { useState, useEffect } from 'react'
import { useTodayWorkLog, useCreateWorkLog, useUpdateWorkLog } from '@/hooks'
import './integrity-logger.less'

export type IntegrityLoggerProps = {
  compact?: boolean
}

const IntegrityLogger = ({ compact = false }: IntegrityLoggerProps) => {
  const { data: todayLog, isLoading } = useTodayWorkLog()
  const createWorkLog = useCreateWorkLog()
  const updateWorkLog = useUpdateWorkLog()

  const [showNoteInput, setShowNoteInput] = useState(false)
  const [successNote, setSuccessNote] = useState('')
  const [missedNote, setMissedNote] = useState('')
  const [pendingScore, setPendingScore] = useState<0 | 1 | null>(null)

  useEffect(() => {
    if (todayLog) {
      setSuccessNote(todayLog.successNote || '')
      setMissedNote(todayLog.missedOpportunityNote || '')
    }
  }, [todayLog])

  const handleScoreSelect = (score: 0 | 1) => {
    setPendingScore(score)
    setShowNoteInput(true)
    setSuccessNote('')
    setMissedNote('')
  }

  const submitScore = (score: 0 | 1, successNoteVal?: string, missedNoteVal?: string) => {
    const today = new Date().toISOString().split('T')[0]

    if (todayLog) {
      updateWorkLog.mutate({
        id: todayLog.id,
        data: {
          integrityScore: score,
          missedOpportunityNote: missedNoteVal || undefined,
          successNote: successNoteVal || undefined,
        },
      })
    } else {
      createWorkLog.mutate({
        logDate: today,
        integrityScore: score,
        missedOpportunityNote: missedNoteVal || undefined,
        successNote: successNoteVal || undefined,
      })
    }

    setShowNoteInput(false)
    setPendingScore(null)
  }

  const handleNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pendingScore === null) return
    submitScore(pendingScore, successNote.trim(), missedNote.trim())
  }

  const handleSkip = () => {
    if (pendingScore === null) return
    submitScore(pendingScore)
  }

  const handleCancel = () => {
    setShowNoteInput(false)
    setPendingScore(null)
    setSuccessNote('')
    setMissedNote('')
  }

  if (isLoading) {
    return <div className="integrity-logger__skeleton" />
  }

  const hasLoggedToday = todayLog?.integrityScore !== null && todayLog?.integrityScore !== undefined

  if (compact) {
    if (showNoteInput && pendingScore !== null) {
      return (
        <div className="integrity-logger__note-form">
          <form onSubmit={handleNoteSubmit}>
            <div className={`integrity-logger__note-status integrity-logger__note-status--${pendingScore === 1 ? 'success' : 'fail'}`}>
              {pendingScore === 1 ? '✓ Success Day' : '✗ Missed Opportunity'}
            </div>

            <div>
              <label className="integrity-logger__note-label">What went well? (optional)</label>
              <textarea
                value={successNote}
                onChange={(e) => setSuccessNote(e.target.value)}
                placeholder="Wins, achievements..."
                className="integrity-logger__textarea"
              />
            </div>

            <div>
              <label className="integrity-logger__note-label">What could improve? (optional)</label>
              <textarea
                value={missedNote}
                onChange={(e) => setMissedNote(e.target.value)}
                placeholder="Missed opportunities..."
                className="integrity-logger__textarea"
              />
            </div>

            <div className="integrity-logger__note-actions">
              <button type="button" onClick={handleCancel} className="btn btn-ghost">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={createWorkLog.isPending || updateWorkLog.isPending}
                className="btn btn-ghost"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={createWorkLog.isPending || updateWorkLog.isPending}
                className="btn btn-primary"
              >
                {createWorkLog.isPending || updateWorkLog.isPending ? '...' : 'Log'}
              </button>
            </div>
          </form>
        </div>
      )
    }

    return (
      <div className="integrity-logger__compact">
        <div className="integrity-logger__compact-header">
          <div>
            <div className="integrity-logger__label">Today's Integrity</div>
            {hasLoggedToday ? (
              <div className={`integrity-logger__status integrity-logger__status--${todayLog.integrityScore === 1 ? 'success' : 'missed'}`}>
                {todayLog.integrityScore === 1 ? '✓ Success' : '✗ Missed'}
              </div>
            ) : (
              <div className="integrity-logger__not-logged">Not logged</div>
            )}
          </div>

          {!hasLoggedToday && (
            <div className="integrity-logger__buttons">
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
    )
  }

  return (
    <div className="integrity-logger__full">
      <div className="integrity-logger__full-header">
        <h3 className="integrity-logger__full-title">Work Integrity</h3>
        <span className="integrity-logger__full-date">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
      </div>

      {hasLoggedToday ? (
        <div className="integrity-logger__result">
          <div className={`integrity-logger__result-icon integrity-logger__result-icon--${todayLog.integrityScore === 1 ? 'success' : 'fail'}`}>
            {todayLog.integrityScore === 1 ? '✓' : '✗'}
          </div>
          <div className="integrity-logger__result-text">
            {todayLog.integrityScore === 1 ? 'Productive day logged' : 'Missed opportunity logged'}
          </div>
          {todayLog.successNote && (
            <div className="integrity-logger__result-note integrity-logger__result-note--success">
              ✓ &ldquo;{todayLog.successNote}&rdquo;
            </div>
          )}
          {todayLog.missedOpportunityNote && (
            <div className="integrity-logger__result-note integrity-logger__result-note--fail">
              ✗ &ldquo;{todayLog.missedOpportunityNote}&rdquo;
            </div>
          )}
        </div>
      ) : showNoteInput ? (
        <form onSubmit={handleNoteSubmit}>
          <div className={`integrity-logger__note-status integrity-logger__note-status--${pendingScore === 1 ? 'success' : 'fail'}`}>
            {pendingScore === 1 ? '✓ Logging Success Day' : '✗ Logging Missed Opportunity'}
          </div>

          <div>
            <label className="integrity-logger__note-label">What went well? (optional)</label>
            <textarea
              value={successNote}
              onChange={(e) => setSuccessNote(e.target.value)}
              placeholder="Wins, achievements, good decisions..."
              className="integrity-logger__textarea"
            />
          </div>

          <div>
            <label className="integrity-logger__note-label">What could improve? (optional)</label>
            <textarea
              value={missedNote}
              onChange={(e) => setMissedNote(e.target.value)}
              placeholder="Missed opportunities, things to work on..."
              className="integrity-logger__textarea"
            />
          </div>

          <div className="integrity-logger__note-actions">
            <button type="button" onClick={handleCancel} className="btn btn-ghost">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={createWorkLog.isPending || updateWorkLog.isPending}
              className="btn btn-ghost"
            >
              Skip Notes
            </button>
            <button
              type="submit"
              disabled={createWorkLog.isPending || updateWorkLog.isPending}
              className="btn btn-primary"
            >
              {createWorkLog.isPending || updateWorkLog.isPending ? 'Saving...' : 'Log'}
            </button>
          </div>
        </form>
      ) : (
        <div className="integrity-logger__score-buttons">
          <button
            onClick={() => handleScoreSelect(1)}
            disabled={createWorkLog.isPending}
            className="integrity-logger__score-btn integrity-btn integrity-btn-success"
          >
            1
          </button>
          <button
            onClick={() => handleScoreSelect(0)}
            className="integrity-logger__score-btn integrity-btn integrity-btn-fail"
          >
            0
          </button>
        </div>
      )}
    </div>
  )
}

export default IntegrityLogger
