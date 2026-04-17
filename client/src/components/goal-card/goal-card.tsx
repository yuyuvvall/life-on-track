import './goal-card.less'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Goal } from '@/types'
import { GoalFormModal } from '../goal-form-modal'

export type GoalCardProps = {
  goal: Goal
  onDelete?: (id: string) => void
}

const GoalCard = ({ goal, onDelete }: GoalCardProps) => {
  const [isEditing, setIsEditing] = useState(false)

  const getProgressInfo = () => {
    if (goal.goalType === 'reading' && goal.totalPages) {
      const percent = Math.round((goal.currentPage / goal.totalPages) * 100)
      return {
        label: `${goal.currentPage} / ${goal.totalPages} pages`,
        percent,
        colorMod: percent >= 100 ? 'green' : 'blue',
      }
    } else if (goal.goalType === 'frequency') {
      const percent = goal.targetValue > 0
        ? Math.round((goal.currentValue / goal.targetValue) * 100)
        : 0
      return {
        label: `${goal.currentValue} / ${goal.targetValue} ${goal.unit || 'times'} ${goal.frequencyPeriod || 'weekly'}`,
        percent: Math.min(percent, 100),
        colorMod: percent >= 100 ? 'green' : 'amber',
      }
    } else {
      const percent = goal.targetValue > 0
        ? Math.round((goal.currentValue / goal.targetValue) * 100)
        : 0
      return {
        label: `${goal.currentValue} / ${goal.targetValue} ${goal.unit || ''}`,
        percent: Math.min(percent, 100),
        colorMod: percent >= 100 ? 'green' : 'purple',
      }
    }
  }

  const progress = getProgressInfo()
  const typeIcon = goal.goalType === 'reading' ? '📖' : goal.goalType === 'frequency' ? '🔄' : '📊'

  return (
    <>
      <Link to={`/goals/${goal.id}`} className="goal-card">
        <div className="goal-card__header">
          <div className="goal-card__title-group">
            <span className="goal-card__icon">{typeIcon}</span>
            <h3 className="goal-card__title">{goal.title}</h3>
          </div>
          <div className="goal-card__actions">
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setIsEditing(true)
              }}
              className="goal-card__edit-btn"
              title="Edit goal"
            >
              <svg className="goal-card__edit-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDelete(goal.id)
                }}
                className="goal-card__archive-btn"
              >
                Archive
              </button>
            )}
          </div>
        </div>

        <div className="goal-card__progress-label">{progress.label}</div>

        <div className="goal-card__progress-track">
          <div
            className={`goal-card__progress-fill goal-card__progress-fill--${progress.colorMod}`}
            style={{ width: `${progress.percent}%` }}
          />
        </div>

        {goal.targetDate && (
          <div className="goal-card__target-date">
            Target: {new Date(goal.targetDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </div>
        )}
      </Link>

      {isEditing && (
        <GoalFormModal
          goal={goal}
          onClose={() => setIsEditing(false)}
        />
      )}
    </>
  )
}

export default GoalCard
