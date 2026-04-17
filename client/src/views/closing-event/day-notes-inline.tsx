import './day-notes-inline.less'
import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faXmark, faPenToSquare, faXmark as faClose } from '@fortawesome/free-solid-svg-icons'

export type DayNotesInlineProps = {
  date: string
  integrityScore: 0 | 1 | null
  isEditing: boolean
  onEditClick: () => void
  onClose: () => void
  children: ReactNode
}

const DayNotesInline = ({
  date,
  integrityScore,
  isEditing,
  onEditClick,
  onClose,
  children,
}: DayNotesInlineProps) => {
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="day-notes-inline">
      <div className="day-notes-inline__header">
        <div className="day-notes-inline__header-left">
          {!isEditing && (
            <div className={`day-notes-inline__score-icon ${integrityScore === 1 ? 'day-notes-inline__score-icon--success' : 'day-notes-inline__score-icon--failure'}`}>
              <FontAwesomeIcon icon={integrityScore === 1 ? faCheck : faXmark} />
            </div>
          )}
          <h3 className="day-notes-inline__title">{formattedDate}</h3>
        </div>
        <div className="day-notes-inline__header-right">
          {!isEditing && (
            <button onClick={onEditClick} className="day-notes-inline__edit-btn" title="Edit">
              <FontAwesomeIcon icon={faPenToSquare} className="day-notes-inline__edit-icon" /> Edit
            </button>
          )}
          <button onClick={onClose} className="day-notes-inline__close-btn" title="Close">
            <FontAwesomeIcon icon={faClose} />
          </button>
        </div>
      </div>

      {children}
    </div>
  )
}

export default DayNotesInline
