import './integrity-edit-form.less'
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
    <form onSubmit={handleSubmit} className="integrity-edit-form">
      <div>
        <label className="integrity-edit-form__label integrity-edit-form__label--spaced">Integrity Score</label>
        <div className="integrity-edit-form__score-buttons">
          <button
            type="button"
            onClick={() => onScoreChange(1)}
            className={`integrity-edit-form__score-btn ${score === 1 ? 'integrity-edit-form__score-btn--success' : ''}`}
          >
            <FontAwesomeIcon icon={faCheck} className="integrity-edit-form__btn-icon" /> Success
          </button>
          <button
            type="button"
            onClick={() => onScoreChange(0)}
            className={`integrity-edit-form__score-btn ${score === 0 ? 'integrity-edit-form__score-btn--failure' : ''}`}
          >
            <FontAwesomeIcon icon={faXmark} className="integrity-edit-form__btn-icon" /> Missed
          </button>
        </div>
      </div>

      <div>
        <label className="integrity-edit-form__label">What went well? (optional)</label>
        <textarea
          value={successNote}
          onChange={(e) => onSuccessNoteChange(e.target.value)}
          placeholder="Wins, achievements..."
          className="integrity-edit-form__textarea"
        />
      </div>

      <div>
        <label className="integrity-edit-form__label">What could improve? (optional)</label>
        <textarea
          value={missedNote}
          onChange={(e) => onMissedNoteChange(e.target.value)}
          placeholder="Missed opportunities..."
          className="integrity-edit-form__textarea"
        />
      </div>

      <div className="integrity-edit-form__actions">
        <button type="button" onClick={onCancel} className="btn btn-ghost integrity-edit-form__action-btn">
          Cancel
        </button>
        <button type="submit" disabled={isPending} className="btn btn-primary integrity-edit-form__action-btn">
          {isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  )
}

export default IntegrityEditForm
