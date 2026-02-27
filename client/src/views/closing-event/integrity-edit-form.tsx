import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons'

export type IntegrityEditFormProps = {
  score: 0 | 1
  successNote: string
  missedNote: string
  isPending: boolean
  onScoreChange: (score: 0 | 1) => void
  onSuccessNoteChange: (value: string) => void
  onMissedNoteChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

const IntegrityEditForm = ({
  score,
  successNote,
  missedNote,
  isPending,
  onScoreChange,
  onSuccessNoteChange,
  onMissedNoteChange,
  onSave,
  onCancel,
}: IntegrityEditFormProps) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs text-gray-500 mb-2">Integrity Score</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onScoreChange(1)}
            className={`flex-1 py-3 rounded-lg font-medium transition-all ${
              score === 1
                ? 'bg-accent-green text-white'
                : 'bg-surface-700 text-gray-400 hover:bg-surface-600'
            }`}
          >
            <FontAwesomeIcon icon={faCheck} className="mr-1" /> Success
          </button>
          <button
            type="button"
            onClick={() => onScoreChange(0)}
            className={`flex-1 py-3 rounded-lg font-medium transition-all ${
              score === 0
                ? 'bg-accent-red text-white'
                : 'bg-surface-700 text-gray-400 hover:bg-surface-600'
            }`}
          >
            <FontAwesomeIcon icon={faXmark} className="mr-1" /> Missed
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">What went well? (optional)</label>
        <textarea
          value={successNote}
          onChange={(e) => onSuccessNoteChange(e.target.value)}
          placeholder="Wins, achievements..."
          className="w-full h-16 text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">What could improve? (optional)</label>
        <textarea
          value={missedNote}
          onChange={(e) => onMissedNoteChange(e.target.value)}
          placeholder="Missed opportunities..."
          className="w-full h-16 text-sm resize-none"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost flex-1"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="btn btn-primary flex-1"
        >
          {isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  )
}

export default IntegrityEditForm
