import { useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useTodayWorkLog, useCreateWorkLog } from '@/hooks'
import './integrity-modal.less'

const IntegrityModal = () => {
  const { integrityModalOpen, closeIntegrityModal } = useUIStore()
  const { data: todayLog } = useTodayWorkLog()
  const createWorkLog = useCreateWorkLog()

  const [score, setScore] = useState<0 | 1 | null>(null)
  const [successNote, setSuccessNote] = useState('')
  const [missedNote, setMissedNote] = useState('')

  const resetForm = () => {
    setScore(null)
    setSuccessNote('')
    setMissedNote('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (score === null) return

    const today = new Date().toISOString().split('T')[0]
    createWorkLog.mutate(
      {
        logDate: today,
        integrityScore: score,
        missedOpportunityNote: missedNote.trim() || undefined,
        successNote: successNote.trim() || undefined,
      },
      {
        onSuccess: () => {
          closeIntegrityModal()
          resetForm()
        },
      }
    )
  }

  const handleSkip = () => {
    if (score === null) return
    const today = new Date().toISOString().split('T')[0]
    createWorkLog.mutate(
      {
        logDate: today,
        integrityScore: score,
      },
      {
        onSuccess: () => {
          closeIntegrityModal()
          resetForm()
        },
      }
    )
  }

  if (!integrityModalOpen || (todayLog?.integrityScore !== null && todayLog?.integrityScore !== undefined)) {
    return null
  }

  return (
    <div className="integrity-modal" onClick={closeIntegrityModal}>
      <div className="integrity-modal__card" onClick={(e) => e.stopPropagation()}>
        <h2 className="integrity-modal__title">Daily Integrity Check</h2>
        <p className="integrity-modal__subtitle">Did you maintain work integrity today?</p>

        <form onSubmit={handleSubmit} className="integrity-modal__form">
          <div className="integrity-modal__score-buttons">
            <button
              type="button"
              onClick={() => setScore(1)}
              className={`integrity-modal__score-btn ${score === 1 ? 'integrity-modal__score-btn--active-success' : ''}`}
            >
              1
            </button>
            <button
              type="button"
              onClick={() => setScore(0)}
              className={`integrity-modal__score-btn integrity-modal__score-btn--fail ${score === 0 ? 'integrity-modal__score-btn--active-fail' : ''}`}
            >
              0
            </button>
          </div>

          <div className="integrity-modal__score-labels">
            <span>Success</span>
            <span>Missed</span>
          </div>

          {score !== null && (
            <div className="integrity-modal__detail">
              <div
                className={`integrity-modal__detail-status ${
                  score === 1 ? 'integrity-modal__detail-status--success' : 'integrity-modal__detail-status--fail'
                }`}
              >
                {score === 1 ? '✓ Success Day' : '✗ Missed Opportunity'}
              </div>

              <div>
                <label className="integrity-modal__note-label">What went well? (optional)</label>
                <textarea
                  value={successNote}
                  onChange={(e) => setSuccessNote(e.target.value)}
                  placeholder="Wins, achievements..."
                  className="integrity-modal__textarea"
                />
              </div>

              <div>
                <label className="integrity-modal__note-label">What could improve? (optional)</label>
                <textarea
                  value={missedNote}
                  onChange={(e) => setMissedNote(e.target.value)}
                  placeholder="Missed opportunities..."
                  className="integrity-modal__textarea"
                />
              </div>
            </div>
          )}

          <div className="integrity-modal__actions">
            <button type="button" onClick={closeIntegrityModal} className="btn btn-ghost integrity-modal__action-btn">
              Later
            </button>
            {score !== null && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={createWorkLog.isPending}
                className="btn btn-ghost integrity-modal__action-btn"
              >
                Skip
              </button>
            )}
            <button
              type="submit"
              disabled={score === null || createWorkLog.isPending}
              className="btn btn-primary integrity-modal__action-btn"
            >
              {createWorkLog.isPending ? 'Saving...' : 'Log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default IntegrityModal
