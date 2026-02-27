import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons'
import type { WorkLog } from '@/types'

export type DayNotesContentProps = {
  log: WorkLog
}

const DayNotesContent = ({ log }: DayNotesContentProps) => {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-accent-green font-medium mb-1 flex items-center gap-1">
          <FontAwesomeIcon icon={faCheck} className="text-[10px]" /> What went well
        </div>
        {log.successNote ? (
          <div className="text-sm text-gray-300 bg-accent-green/10 rounded-lg p-3 border-l-2 border-accent-green">
            {log.successNote}
          </div>
        ) : (
          <div className="text-sm text-gray-500 italic">No notes recorded</div>
        )}
      </div>

      <div>
        <div className="text-xs text-accent-red font-medium mb-1 flex items-center gap-1">
          <FontAwesomeIcon icon={faXmark} className="text-[10px]" /> What could improve
        </div>
        {log.missedOpportunityNote ? (
          <div className="text-sm text-gray-300 bg-accent-red/10 rounded-lg p-3 border-l-2 border-accent-red">
            {log.missedOpportunityNote}
          </div>
        ) : (
          <div className="text-sm text-gray-500 italic">No notes recorded</div>
        )}
      </div>
    </div>
  )
}

export default DayNotesContent
