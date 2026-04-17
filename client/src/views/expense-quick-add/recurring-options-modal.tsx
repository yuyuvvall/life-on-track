import { useState } from 'react'
import { WEEK_DAY_NAMES } from '@/utils/dateConstants'
import type { RecurrenceType } from '@/types'
import './recurring-options-modal.less'

export type RecurringOptionsModalProps = {
  recurrenceType: RecurrenceType
  recurrenceDay: number
  onSave: (type: RecurrenceType, day: number) => void
  onCancel: () => void
}

const RecurringOptionsModal = ({
  recurrenceType,
  recurrenceDay,
  onSave,
  onCancel,
}: RecurringOptionsModalProps) => {
  const [tempType, setTempType] = useState(recurrenceType)
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

          {tempType === 'weekly' ? (
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
            onClick={() => onSave(tempType, tempDay)}
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
