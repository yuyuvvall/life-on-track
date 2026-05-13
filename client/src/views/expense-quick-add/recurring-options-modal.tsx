import { useState } from 'react'
import { WEEK_DAY_NAMES } from '@/utils/dateConstants'
import type { RecurrenceType } from '@/types'
import './recurring-options-modal.less'

export type RecurringOptionsModalProps = {
  recurrenceType: RecurrenceType
  recurrenceDay: number
  isRecurring: boolean
  onSave: (type: RecurrenceType, day: number) => void
  onTurnOff: () => void
  onCancel: () => void
  // Editing an existing template can't toggle "recurring or not" — the row only
  // exists because it's recurring. Hide the Off button in that flow.
  hideOffOption?: boolean
}

type TempType = RecurrenceType | 'off'

const RecurringOptionsModal = ({
  recurrenceType,
  recurrenceDay,
  isRecurring,
  onSave,
  onTurnOff,
  onCancel,
  hideOffOption = false,
}: RecurringOptionsModalProps) => {
  const [tempType, setTempType] = useState<TempType>(
    isRecurring || hideOffOption ? recurrenceType : 'off'
  )
  const [tempDay, setTempDay] = useState(recurrenceDay)

  return (
    <div className="recurring-options-modal" onClick={onCancel}>
      <div
        className="recurring-options-modal__card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="recurring-options-modal__header">
          <p className="recurring-options-modal__subtitle">Recurring Schedule</p>
          <p className="recurring-options-modal__title">Set frequency</p>
        </div>

        <div className="recurring-options-modal__body">
          <div className="recurring-options-modal__type-group">
            {!hideOffOption && (
              <button
                onClick={() => setTempType('off')}
                className={`recurring-options-modal__type-btn${
                  tempType === 'off' ? ' recurring-options-modal__type-btn--active' : ''
                }`}
              >
                Off
              </button>
            )}
            <button
              onClick={() => { setTempType('weekly'); setTempDay(0) }}
              className={`recurring-options-modal__type-btn${
                tempType === 'weekly' ? ' recurring-options-modal__type-btn--active' : ''
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => { setTempType('monthly'); setTempDay(1) }}
              className={`recurring-options-modal__type-btn${
                tempType === 'monthly' ? ' recurring-options-modal__type-btn--active' : ''
              }`}
            >
              Monthly
            </button>
          </div>

          {tempType === 'off' ? (
            <p className="recurring-options-modal__off-hint">
              Recurring is turned off. This expense will be saved as a one-time entry.
            </p>
          ) : tempType === 'weekly' ? (
            <div>
              <p className="recurring-options-modal__day-label">Day of week</p>
              <div className="recurring-options-modal__day-grid">
                {WEEK_DAY_NAMES.map((day, index) => (
                  <button
                    key={day}
                    onClick={() => setTempDay(index)}
                    className={`recurring-options-modal__day-btn${
                      tempDay === index ? ' recurring-options-modal__day-btn--selected' : ''
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="recurring-options-modal__day-label">Day of month</p>
              <div className="recurring-options-modal__day-grid recurring-options-modal__day-grid--scrollable">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    onClick={() => setTempDay(day)}
                    className={`recurring-options-modal__day-btn${
                      tempDay === day ? ' recurring-options-modal__day-btn--selected' : ''
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="recurring-options-modal__actions">
          <button onClick={onCancel} className="recurring-options-modal__cancel-btn">
            Cancel
          </button>
          <button
            onClick={() => {
              if (tempType === 'off') onTurnOff()
              else onSave(tempType, tempDay)
            }}
            className="recurring-options-modal__save-btn"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default RecurringOptionsModal
