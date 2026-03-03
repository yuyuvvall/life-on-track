import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useGoalStats, useLogGoalProgress, useDeleteGoal } from '@/hooks'
import { GoalFormModal } from '@/components/goal-form-modal'
import GoalLogEditModal from './goal-log-edit-modal'
import type { Goal, GoalLog } from '@/types'
import './goal-detail-view.less'

const GoalDetailView = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: stats, isLoading } = useGoalStats(id!)
  const logProgress = useLogGoalProgress()
  const deleteGoal = useDeleteGoal()

  const [logValue, setLogValue] = useState('')
  const [logNote, setLogNote] = useState('')
  const [showLogForm, setShowLogForm] = useState(false)
  const [showAddSubGoal, setShowAddSubGoal] = useState(false)
  const [showEditGoal, setShowEditGoal] = useState(false)

  const [habitNote, setHabitNote] = useState('')
  const [showHabitNoteFor, setShowHabitNoteFor] = useState<'did' | 'didnt' | null>(null)
  const [historyFilter, setHistoryFilter] = useState<'positive' | 'negative' | null>(null)
  const [editingLog, setEditingLog] = useState<GoalLog | null>(null)

  if (isLoading || !stats) {
    return (
      <div className="goal-detail-view goal-detail-view--loading">
        <div className="goal-detail-view__loading-text">Loading goal...</div>
      </div>
    )
  }

  const {
    goal,
    logs,
    subGoals,
    subGoalsCompleted,
    velocity,
    estimatedFinishDate,
    daysRemaining,
    progressPercent,
    streak,
    periodProgress,
  } = stats

  const handleLogSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = parseInt(logValue)
    if (isNaN(value)) return

    logProgress.mutate(
      { id: goal.id, data: { value, note: logNote || undefined } },
      {
        onSuccess: () => {
          setLogValue('')
          setLogNote('')
          setShowLogForm(false)
        },
      }
    )
  }

  const handleHabitLog = (value: 0 | 1) => {
    logProgress.mutate(
      { id: goal.id, data: { value, note: habitNote || undefined } },
      {
        onSuccess: () => {
          setHabitNote('')
          setShowHabitNoteFor(null)
        },
      }
    )
  }

  const handleDelete = () => {
    if (confirm('Archive this goal? You can reactivate it later.')) {
      deleteGoal.mutate(goal.id, {
        onSuccess: () => navigate('/goals'),
      })
    }
  }

  const getSubGoalProgress = (sg: Goal): number => {
    if (sg.goalType === 'reading' && sg.totalPages) {
      return Math.min(Math.round(((sg.currentPage ?? 0) / sg.totalPages) * 100), 100)
    }
    if (sg.targetValue > 0) {
      return Math.min(Math.round((sg.currentValue / sg.targetValue) * 100), 100)
    }
    return 0
  }

  const getSubGoalProgressText = (sg: Goal): string => {
    if (sg.goalType === 'reading' && sg.totalPages) {
      return `${sg.currentPage ?? 0}/${sg.totalPages} pg`
    }
    if (sg.goalType === 'frequency') {
      return `${sg.currentValue}/${sg.targetValue} ${sg.frequencyPeriod || 'times'}`
    }
    return `${sg.currentValue}/${sg.targetValue} ${sg.unit || ''}`
  }

  const typeIcon =
    goal.goalType === 'reading' ? '📖' : goal.goalType === 'frequency' ? '🔄' : '📊'
  const hasSubGoals = subGoals.length > 0

  return (
    <div className="goal-detail-view">
      {/* Header */}
      <header className="goal-detail-view__header">
        <div className="goal-detail-view__header-inner">
          <Link to="/goals" className="goal-detail-view__back-link">
            ← All Goals
          </Link>
          <div className="goal-detail-view__title-row">
            <h1 className="goal-detail-view__title">
              <span>{typeIcon}</span>
              {goal.title}
            </h1>
            <div className="goal-detail-view__header-actions">
              <button
                onClick={() => setShowEditGoal(true)}
                className="goal-detail-view__edit-link"
              >
                <svg className="goal-detail-view__edit-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
              <button onClick={handleDelete} className="goal-detail-view__archive-link">
                Archive
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="goal-detail-view__main">
        {/* Progress Overview */}
        <div className="goal-detail-view__progress-card">
          <div className="goal-detail-view__progress-header">
            <span className="goal-detail-view__progress-label">Progress</span>
            <span className="goal-detail-view__progress-value">{progressPercent}%</span>
          </div>
          <div className="goal-detail-view__progress-bar-track">
            <div
              className={`goal-detail-view__progress-bar-fill ${
                progressPercent >= 100 ? 'goal-detail-view__progress-bar-fill--complete' : ''
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {goal.goalType === 'reading' && goal.totalPages && (
            <div className="goal-detail-view__progress-detail">
              <span className="goal-detail-view__progress-mono">{goal.currentPage}</span> of{' '}
              <span className="goal-detail-view__progress-mono">{goal.totalPages}</span> pages
            </div>
          )}

          {goal.goalType === 'frequency' && periodProgress && (
            <div className="goal-detail-view__progress-detail">
              <span className="goal-detail-view__progress-mono">{periodProgress.current}</span> of{' '}
              <span className="goal-detail-view__progress-mono">{periodProgress.target}</span> this{' '}
              {goal.frequencyPeriod}
            </div>
          )}

          {goal.goalType === 'numeric' && (
            <div className="goal-detail-view__progress-detail">
              <span className="goal-detail-view__progress-mono">{goal.currentValue}</span> of{' '}
              <span className="goal-detail-view__progress-mono">{goal.targetValue}</span> {goal.unit}
            </div>
          )}

          {hasSubGoals && (
            <div className="goal-detail-view__progress-sub">
              <span className="goal-detail-view__progress-mono">{subGoalsCompleted}</span> of{' '}
              <span className="goal-detail-view__progress-mono">{subGoals.length}</span> sub-goals
              completed
            </div>
          )}
        </div>

        {/* Velocity & Projections (Reading goals) */}
        {goal.goalType === 'reading' && (
          <div className="goal-detail-view__stats-grid goal-detail-view__stats-grid--cols-2">
            <div className="goal-detail-view__stat">
              <div className="goal-detail-view__stat-label">Reading Velocity</div>
              <div className="goal-detail-view__stat-value goal-detail-view__stat-value--blue">
                {velocity !== null ? `${velocity}` : '—'}
              </div>
              <div className="goal-detail-view__stat-label">pages/day</div>
            </div>
            <div className="goal-detail-view__stat">
              <div className="goal-detail-view__stat-label">Est. Finish</div>
              <div className="goal-detail-view__stat-value goal-detail-view__stat-value--green">
                {estimatedFinishDate
                  ? new Date(estimatedFinishDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '—'}
              </div>
              <div className="goal-detail-view__stat-label">
                {daysRemaining !== null ? `${daysRemaining} days left` : 'Keep reading!'}
              </div>
            </div>
          </div>
        )}

        {/* Sub-Goals Section */}
        <div className="goal-detail-view__sub-goals">
          <div className="goal-detail-view__sub-goal-header">
            <h2 className="goal-detail-view__section-title">
              Sub-Goals ({subGoalsCompleted}/{subGoals.length})
            </h2>
            <button
              onClick={() => setShowAddSubGoal(true)}
              className="goal-detail-view__add-link"
            >
              + Add Sub-Goal
            </button>
          </div>

          {subGoals.length === 0 ? (
            <div className="goal-detail-view__empty-card">
              <div className="goal-detail-view__empty-text">No sub-goals yet</div>
              <button
                onClick={() => setShowAddSubGoal(true)}
                className="goal-detail-view__add-link"
              >
                Add a sub-goal to break down this goal
              </button>
            </div>
          ) : (
            <div className="goal-detail-view__sub-goal-list">
              {subGoals.map((sg) => {
                const isComplete =
                  sg.goalType === 'numeric' || sg.goalType === 'reading'
                    ? sg.currentValue >= sg.targetValue ||
                      (sg.currentPage ?? 0) >= (sg.totalPages ?? 1)
                    : sg.currentValue >= sg.targetValue
                const sgPercent = getSubGoalProgress(sg)
                const sgTypeIcon =
                  sg.goalType === 'reading'
                    ? '📖'
                    : sg.goalType === 'frequency'
                      ? '🔄'
                      : '📊'

                return (
                  <Link
                    key={sg.id}
                    to={`/goals/${sg.id}`}
                    className={`goal-detail-view__sub-goal-card ${
                      isComplete ? 'goal-detail-view__sub-goal-card--complete' : ''
                    }`}
                  >
                    <div className="goal-detail-view__sub-goal-row">
                      <span className="goal-detail-view__sub-goal-icon">{sgTypeIcon}</span>
                      <div className="goal-detail-view__sub-goal-content">
                        <div className="goal-detail-view__sub-goal-info">
                          <span
                            className={`goal-detail-view__sub-goal-title ${
                              isComplete ? 'goal-detail-view__sub-goal-title--complete' : ''
                            }`}
                          >
                            {sg.title}
                          </span>
                          <span className="goal-detail-view__sub-goal-progress">
                            {getSubGoalProgressText(sg)}
                          </span>
                        </div>
                        <div className="goal-detail-view__sub-goal-bar-track">
                          <div
                            className={`goal-detail-view__sub-goal-bar-fill ${
                              isComplete
                                ? 'goal-detail-view__sub-goal-bar-fill--complete'
                                : ''
                            }`}
                            style={{ width: `${sgPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="goal-detail-view__stats-grid goal-detail-view__stats-grid--cols-3">
          <div className="goal-detail-view__stat goal-detail-view__stat--center">
            <div className="goal-detail-view__stat-value goal-detail-view__stat-value--amber">
              {streak}
            </div>
            <div className="goal-detail-view__stat-label">Day Streak</div>
          </div>
          <div className="goal-detail-view__stat goal-detail-view__stat--center">
            <div className="goal-detail-view__stat-value">{logs.length}</div>
            <div className="goal-detail-view__stat-label">Total Logs</div>
          </div>
          <div className="goal-detail-view__stat goal-detail-view__stat--center">
            <div className="goal-detail-view__stat-value">
              {goal.startDate
                ? Math.ceil(
                    (Date.now() - new Date(goal.startDate).getTime()) / (1000 * 60 * 60 * 24)
                  )
                : 0}
            </div>
            <div className="goal-detail-view__stat-label">Days Active</div>
          </div>
        </div>

        {/* Habit Goal: Did it / Didn't buttons */}
        {goal.goalType === 'frequency' && (
          <div className="goal-detail-view__habit-section">
            {!showHabitNoteFor ? (
              <div className="goal-detail-view__habit-buttons">
                <button
                  onClick={() => setShowHabitNoteFor('did')}
                  disabled={logProgress.isPending}
                  className="goal-detail-view__habit-btn goal-detail-view__habit-btn--did"
                >
                  <svg className="goal-detail-view__habit-btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Did it
                </button>
                <button
                  onClick={() => setShowHabitNoteFor('didnt')}
                  disabled={logProgress.isPending}
                  className="goal-detail-view__habit-btn goal-detail-view__habit-btn--didnt"
                >
                  <svg className="goal-detail-view__habit-btn-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Didn't
                </button>
              </div>
            ) : (
              <div className="goal-detail-view__habit-note-form">
                <div className="goal-detail-view__habit-note-status">
                  {showHabitNoteFor === 'did' ? (
                    <span className="goal-detail-view__habit-status-text goal-detail-view__habit-status-text--did">
                      <svg className="goal-detail-view__habit-status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Completed
                    </span>
                  ) : (
                    <span className="goal-detail-view__habit-status-text goal-detail-view__habit-status-text--didnt">
                      <svg className="goal-detail-view__habit-status-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Missed
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={habitNote}
                  onChange={(e) => setHabitNote(e.target.value)}
                  placeholder="Add a note (optional)..."
                  className="goal-detail-view__habit-note-input"
                  autoFocus
                />
                <div className="goal-detail-view__habit-note-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHabitNoteFor(null)
                      setHabitNote('')
                    }}
                    className="btn btn-ghost goal-detail-view__habit-note-action"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHabitLog(showHabitNoteFor === 'did' ? 1 : 0)}
                    disabled={logProgress.isPending}
                    className={`btn goal-detail-view__habit-note-action goal-detail-view__habit-note-action--${showHabitNoteFor === 'did' ? 'save-did' : 'save-didnt'}`}
                  >
                    {logProgress.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Log Progress Button (non-frequency goals) */}
        {goal.goalType !== 'frequency' && !showLogForm && (
          <button
            onClick={() => setShowLogForm(true)}
            className="btn btn-primary goal-detail-view__log-progress-btn"
          >
            + Log Progress
          </button>
        )}

        {/* Log Form (non-frequency goals) */}
        {goal.goalType !== 'frequency' && showLogForm && (
          <form onSubmit={handleLogSubmit} className="goal-detail-view__log-form">
            <div>
              <label className="goal-detail-view__log-form-label">
                {goal.goalType === 'reading'
                  ? 'Current Page'
                  : `Current ${goal.unit || 'Value'}`}
              </label>
              <input
                type="number"
                value={logValue}
                onChange={(e) => setLogValue(e.target.value)}
                placeholder={goal.goalType === 'reading' ? 'e.g., 85' : 'Enter value'}
                className="goal-detail-view__log-form-input goal-detail-view__log-form-input--mono"
                autoFocus
              />
            </div>
            <div>
              <label className="goal-detail-view__log-form-label">Note (optional)</label>
              <input
                type="text"
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                placeholder="Any notes..."
                className="goal-detail-view__log-form-input"
              />
            </div>
            <div className="goal-detail-view__log-form-actions">
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="btn btn-ghost goal-detail-view__log-form-action"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!logValue || logProgress.isPending}
                className="btn btn-primary goal-detail-view__log-form-action"
              >
                {logProgress.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        )}

        {/* Progress History */}
        <div className="goal-detail-view__history">
          <div className="goal-detail-view__history-header">
            <h2 className="goal-detail-view__section-title">Progress History</h2>

            {goal.goalType === 'frequency' && (
              <div className="goal-detail-view__filter-group">
                <button
                  onClick={() =>
                    setHistoryFilter(historyFilter === 'positive' ? null : 'positive')
                  }
                  className={`goal-detail-view__filter-btn ${
                    historyFilter === 'positive'
                      ? 'goal-detail-view__filter-btn--active-positive'
                      : ''
                  }`}
                  title="Filter completed only"
                >
                  <svg className="goal-detail-view__filter-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {logs.filter((l) => l.value === 1).length}
                </button>
                <button
                  onClick={() =>
                    setHistoryFilter(historyFilter === 'negative' ? null : 'negative')
                  }
                  className={`goal-detail-view__filter-btn ${
                    historyFilter === 'negative'
                      ? 'goal-detail-view__filter-btn--active-negative'
                      : ''
                  }`}
                  title="Filter missed only"
                >
                  <svg className="goal-detail-view__filter-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {logs.filter((l) => l.value === 0).length}
                </button>
              </div>
            )}
          </div>

          {(() => {
            const filteredLogs =
              goal.goalType === 'frequency' && historyFilter !== null
                ? logs.filter((l) =>
                    historyFilter === 'positive' ? l.value === 1 : l.value === 0
                  )
                : logs

            if (logs.length === 0) {
              return (
                <div className="goal-detail-view__empty-card">
                  No logs yet. Start tracking your progress!
                </div>
              )
            }

            if (filteredLogs.length === 0) {
              return (
                <div className="goal-detail-view__empty-card">
                  {historyFilter === 'positive'
                    ? 'No completed entries yet.'
                    : 'No missed entries. Great job!'}
                </div>
              )
            }

            return (
              <div className="goal-detail-view__log-list">
                {filteredLogs.map((log, index) => {
                  const prevLog = filteredLogs[index + 1]
                  const diff = prevLog ? log.value - prevLog.value : null
                  const isPositive = log.value === 1

                  return (
                    <div
                      key={log.id}
                      onClick={() => setEditingLog(log)}
                      className={`goal-detail-view__log-entry ${
                        goal.goalType === 'frequency'
                          ? isPositive
                            ? 'goal-detail-view__log-entry--frequency-positive'
                            : 'goal-detail-view__log-entry--frequency-negative'
                          : ''
                      }`}
                    >
                      <div>
                        <div className="goal-detail-view__log-date">
                          {new Date(log.logDate).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                        {log.note && (
                          <div className="goal-detail-view__log-note">"{log.note}"</div>
                        )}
                      </div>
                      <div className="goal-detail-view__log-right">
                        {goal.goalType === 'frequency' ? (
                          <div
                            className={`goal-detail-view__log-status ${
                              isPositive
                                ? 'goal-detail-view__log-status--done'
                                : 'goal-detail-view__log-status--missed'
                            }`}
                          >
                            {isPositive ? '✓ Done' : '✗ Missed'}
                          </div>
                        ) : (
                          <>
                            <div className="goal-detail-view__log-value">
                              {log.value}
                              {goal.goalType === 'reading' && (
                                <span className="goal-detail-view__log-unit"> pg</span>
                              )}
                            </div>
                            {diff !== null && diff !== 0 && (
                              <div
                                className={`goal-detail-view__log-diff ${
                                  diff > 0
                                    ? 'goal-detail-view__log-diff--positive'
                                    : 'goal-detail-view__log-diff--negative'
                                }`}
                              >
                                {diff > 0 ? '+' : ''}
                                {diff}
                              </div>
                            )}
                          </>
                        )}
                        <span className="goal-detail-view__log-edit-hint">✎</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </main>

      {showAddSubGoal && (
        <GoalFormModal
          onClose={() => setShowAddSubGoal(false)}
          parentId={goal.id}
          parentTitle={goal.title}
        />
      )}

      {showEditGoal && (
        <GoalFormModal goal={goal} onClose={() => setShowEditGoal(false)} />
      )}

      {editingLog && (
        <GoalLogEditModal
          log={editingLog}
          goal={goal}
          onClose={() => setEditingLog(null)}
        />
      )}
    </div>
  )
}

export default GoalDetailView
