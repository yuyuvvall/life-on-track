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
    <div className="bg-surface-700 rounded-lg p-4 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {!isEditing && (
            <div className={`text-xl ${integrityScore === 1 ? 'text-accent-green' : 'text-accent-red'}`}>
              <FontAwesomeIcon icon={integrityScore === 1 ? faCheck : faXmark} />
            </div>
          )}
          <h3 className="text-sm font-medium text-gray-100">
            {formattedDate}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              onClick={onEditClick}
              className="text-gray-500 hover:text-gray-300 text-sm"
              title="Edit"
            >
              <FontAwesomeIcon icon={faPenToSquare} className="mr-1" /> Edit
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg"
            title="Close"
          >
            <FontAwesomeIcon icon={faClose} />
          </button>
        </div>
      </div>

      {children}
    </div>
  )
}

export default DayNotesInline
