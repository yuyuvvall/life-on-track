import { useState } from 'react'
import { WEEK_DAY_NAMES } from '@/utils/dateConstants'
import './date-picker-modal.less'

export type DatePickerModalProps = {
  selectedDate: Date
  onSelect: (date: Date) => void
  onCancel: () => void
}

const DatePickerModal = ({
  selectedDate,
  onSelect,
  onCancel,
}: DatePickerModalProps) => {
  const [viewDate, setViewDate] = useState(new Date(selectedDate))
  const [tempDate, setTempDate] = useState(new Date(selectedDate))

  const DAYS = WEEK_DAY_NAMES.map(d => d[0])
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  const getCalendarDays = () => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startDay = firstDay.getDay()
    const days: (number | null)[] = []
    for (let i = 0; i < startDay; i++) days.push(null)
    for (let i = 1; i <= lastDay.getDate(); i++) days.push(i)
    return days
  }

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))
  }

  const handleDayClick = (day: number) => {
    setTempDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), day))
  }

  const isSelected = (day: number) =>
    tempDate.getDate() === day &&
    tempDate.getMonth() === viewDate.getMonth() &&
    tempDate.getFullYear() === viewDate.getFullYear()

  const isToday = (day: number) => {
    const today = new Date()
    return today.getDate() === day &&
      today.getMonth() === viewDate.getMonth() &&
      today.getFullYear() === viewDate.getFullYear()
  }

  const formatSelectedDate = (date: Date) =>
    date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="date-picker-modal" onClick={onCancel}>
      <div
        className="date-picker-modal__card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="date-picker-modal__header">
          <p className="date-picker-modal__subtitle">Select day</p>
          <p className="date-picker-modal__selected-date">
            {formatSelectedDate(tempDate)}
          </p>
        </div>

        <div className="date-picker-modal__calendar">
          <div className="date-picker-modal__month-nav">
            <button className="date-picker-modal__month-label">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="date-picker-modal__month-arrows">
              <button onClick={handlePrevMonth} className="date-picker-modal__arrow-btn">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button onClick={handleNextMonth} className="date-picker-modal__arrow-btn">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="date-picker-modal__days-header">
            {DAYS.map((day, i) => (
              <div key={i} className="date-picker-modal__day-header">{day}</div>
            ))}
          </div>

          <div className="date-picker-modal__calendar-grid">
            {getCalendarDays().map((day, i) => (
              <div key={i} className="date-picker-modal__day-cell">
                {day !== null && (
                  <button
                    onClick={() => handleDayClick(day)}
                    className={`date-picker-modal__day-btn${
                      isSelected(day)
                        ? ' date-picker-modal__day-btn--selected'
                        : isToday(day)
                          ? ' date-picker-modal__day-btn--today'
                          : ''
                    }`}
                  >
                    {day}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="date-picker-modal__actions">
          <button onClick={onCancel} className="date-picker-modal__cancel-btn">
            Cancel
          </button>
          <button
            onClick={() => onSelect(tempDate)}
            className="date-picker-modal__ok-btn"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

export default DatePickerModal
