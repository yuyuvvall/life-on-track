import './day-notes-modal.less'
import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faXmark, faPenToSquare } from '@fortawesome/free-solid-svg-icons'

export type DayNotesModalProps = {
  date: string
  integrityScore: 0 | 1 | null
  isEditing: boolean
  onEditClick: () => void
  onClose: () => void
  children: ReactNode
}

const DayNotesModal = ({
  date,
  integrityScore,
  isEditing,
  onEditClick,
  onClose,
  children,
}: DayNotesModalProps) => {
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="day-notes-modal" onClick={onClose}>
      <div className="day-notes-modal__content" onClick={(e) => e.stopPropagation()}>
        <div className="day-notes-modal__header">
          <h2 className="day-notes-modal__title">{formattedDate}</h2>
          {!isEditing && (
            <div className="day-notes-modal__actions">
              <div className={`day-notes-modal__score-icon ${integrityScore === 1 ? 'day-notes-modal__score-icon--success' : 'day-notes-modal__score-icon--failure'}`}>
                <FontAwesomeIcon icon={integrityScore === 1 ? faCheck : faXmark} />
              </div>
              <button onClick={onEditClick} className="day-notes-modal__edit-btn" title="Edit">
                <FontAwesomeIcon icon={faPenToSquare} />
              </button>
            </div>
          )}
        </div>

        {children}
      </div>
    </div>
  )
}

export default DayNotesModal
