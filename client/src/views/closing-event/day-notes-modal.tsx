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
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-800 w-full max-w-sm rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">
            {formattedDate}
          </h2>
          {!isEditing && (
            <div className="flex items-center gap-2">
              <div className={`text-2xl ${integrityScore === 1 ? 'text-accent-green' : 'text-accent-red'}`}>
                <FontAwesomeIcon icon={integrityScore === 1 ? faCheck : faXmark} />
              </div>
              <button
                onClick={onEditClick}
                className="text-gray-500 hover:text-gray-300 p-1"
                title="Edit"
              >
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
