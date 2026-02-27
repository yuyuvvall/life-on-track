import './day-notes-content.less'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons'
import type { WorkLog } from '@/types'

export type DayNotesContentProps = {
  log: WorkLog
}

const DayNotesContent = ({ log }: DayNotesContentProps) => {
  return (
    <div className="day-notes-content">
      <div>
        <div className="day-notes-content__label day-notes-content__label--success">
          <FontAwesomeIcon icon={faCheck} className="day-notes-content__label-icon" /> What went well
        </div>
        {log.successNote ? (
          <div className="day-notes-content__note day-notes-content__note--success">
            {log.successNote}
          </div>
        ) : (
          <div className="day-notes-content__empty">No notes recorded</div>
        )}
      </div>

      <div>
        <div className="day-notes-content__label day-notes-content__label--failure">
          <FontAwesomeIcon icon={faXmark} className="day-notes-content__label-icon" /> What could improve
        </div>
        {log.missedOpportunityNote ? (
          <div className="day-notes-content__note day-notes-content__note--failure">
            {log.missedOpportunityNote}
          </div>
        ) : (
          <div className="day-notes-content__empty">No notes recorded</div>
        )}
      </div>
    </div>
  )
}

export default DayNotesContent
