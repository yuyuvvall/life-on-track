import { useState } from 'react'
import { useUpdateGoalLog } from '@/hooks'
import type { Goal, GoalLog } from '@/types'
import './goal-log-edit-modal.less'

export type GoalLogEditModalProps = {
  log: GoalLog
  goal: Goal
  onClose: () => void
}

const GoalLogEditModal = ({ log, goal, onClose }: GoalLogEditModalProps) => {
  const updateGoalLog = useUpdateGoalLog()
  const [value, setValue] = useState(log.value.toString())
  const [note, setNote] = useState(log.note || '')
  const [logDate, setLogDate] = useState(log.logDate)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numValue = parseInt(value)
    if (isNaN(numValue)) return

    updateGoalLog.mutate(
      {
        goalId: goal.id,
        logId: log.id,
        data: {
          value: numValue,
          note: note || undefined,
          logDate,
        },
      },
      { onSuccess: onClose }
    )
  }

  const handleToggleValue = (newValue: 0 | 1) => {
    setValue(newValue.toString())
  }

  return (
    <div className="goal-log-edit-modal" onClick={onClose}>
      <div
        className="goal-log-edit-modal__card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="goal-log-edit-modal__title">Edit Log</h2>

        <form onSubmit={handleSubmit} className="goal-log-edit-modal__form">
          <div>
            <label className="goal-log-edit-modal__label">Date</label>
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="goal-log-edit-modal__input"
            />
          </div>

          {goal.goalType === 'frequency' ? (
            <div>
              <label className="goal-log-edit-modal__label">Status</label>
              <div className="goal-log-edit-modal__toggle-group">
                <button
                  type="button"
                  onClick={() => handleToggleValue(1)}
                  className={`goal-log-edit-modal__toggle-btn ${
                    value === '1'
                      ? 'goal-log-edit-modal__toggle-btn--did'
                      : ''
                  }`}
                >
                  ✓ Did it
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleValue(0)}
                  className={`goal-log-edit-modal__toggle-btn ${
                    value === '0'
                      ? 'goal-log-edit-modal__toggle-btn--didnt'
                      : ''
                  }`}
                >
                  ✗ Didn't
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="goal-log-edit-modal__label">
                {goal.goalType === 'reading'
                  ? 'Page Number'
                  : `Value (${goal.unit || 'units'})`}
              </label>
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="goal-log-edit-modal__input goal-log-edit-modal__input--mono"
              />
            </div>
          )}

          <div>
            <label className="goal-log-edit-modal__label">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Any notes..."
              className="goal-log-edit-modal__input"
            />
          </div>

          <div className="goal-log-edit-modal__actions">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost goal-log-edit-modal__action-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateGoalLog.isPending}
              className="btn btn-primary goal-log-edit-modal__action-btn"
            >
              {updateGoalLog.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default GoalLogEditModal
