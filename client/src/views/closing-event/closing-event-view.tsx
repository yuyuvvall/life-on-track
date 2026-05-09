import { useState, useMemo, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { useForm } from 'react-hook-form'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import {
  useWeeklySummary,
  useUpdateWorkLog,
  useSubmitReflection,
  useLogGoalProgress,
  useGoalLogs,
} from '@/hooks'
import { IntegrityHeatmap } from '@/components/integrity-heatmap'
import { SpendingChart } from '@/components/spending-chart'
import { GoalsProgress } from '@/components/goals-progress'
import { formatCurrency } from '@/utils/currency'
import DayNotesContent from './day-notes-content'
import IntegrityEditForm from './integrity-edit-form'
import DayNotesModal from './day-notes-modal'
import DayNotesInline from './day-notes-inline'
import type { WorkLog, Goal } from '@/types'
import './closing-event-view.less'

type IntegrityEditData = {
  score: 0 | 1
  successNote: string
  missedNote: string
}

const ClosingEventView = () => {
  const { data: summary, isLoading } = useWeeklySummary()
  const updateWorkLog = useUpdateWorkLog()
  const submitReflection = useSubmitReflection()
  const logGoalProgress = useLogGoalProgress()

  const [reflection, setReflection] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [selectedDay, setSelectedDay] = useState<{ log: WorkLog | null; date: string } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const editForm = useForm<IntegrityEditData>({
    defaultValues: { score: 1, successNote: '', missedNote: '' },
  })

  const { data: expandedGoalLogs = [], isLoading: isLogsLoading } = useGoalLogs(
    expandedGoalId || '',
    10
  )

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const autoPopulatedContent = useMemo(() => {
    if (!summary || summary.missedOpportunityNotes.length === 0) return ''

    let content = '## Missed Opportunities This Week\n\n'
    summary.missedOpportunityNotes.forEach((note, i) => {
      content += `${i + 1}. ${note}\n`
    })
    content += '\n## Points to Improve\n\n- '
    return content
  }, [summary])

  // Part 1 fix: properly auto-populate reflection when summary loads
  useEffect(() => {
    if (autoPopulatedContent && !reflection) {
      setReflection(autoPopulatedContent)
    }
  }, [autoPopulatedContent]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUseTemplate = () => {
    setReflection(autoPopulatedContent)
  }

  const handleDayClick = (log: WorkLog | null, date: string) => {
    if (selectedDay?.date === date) {
      setSelectedDay(null)
      setIsEditing(false)
    } else {
      setSelectedDay({ log, date })
      setIsEditing(false)
    }
  }

  const handleEditClick = () => {
    if (selectedDay?.log) {
      editForm.reset({
        score: selectedDay.log.integrityScore ?? 1,
        successNote: selectedDay.log.successNote || '',
        missedNote: selectedDay.log.missedOpportunityNote || '',
      })
      setIsEditing(true)
    }
  }

  const handleEditSave = () => {
    if (!selectedDay?.log) return
    const data = editForm.getValues()
    updateWorkLog.mutate(
      {
        id: selectedDay.log.id,
        data: {
          integrityScore: data.score,
          successNote: data.successNote || undefined,
          missedOpportunityNote: data.missedNote || undefined,
        },
      },
      {
        onSuccess: () => {
          setIsEditing(false)
          if (isMobile) setSelectedDay(null)
        },
      }
    )
  }

  const handleEditCancel = () => {
    setIsEditing(false)
  }

  const handleSubmitReflection = () => {
    submitReflection.mutate(reflection, {
      onSuccess: () => {
        setSubmitSuccess(true)
        setTimeout(() => setSubmitSuccess(false), 3000)
      },
    })
  }

  const handleGoalToggle = (goalId: string) => {
    setExpandedGoalId(prev => prev === goalId ? null : goalId)
  }

  const handleQuickLog = (goal: Goal) => {
    if (goal.goalType === 'frequency') {
      logGoalProgress.mutate({ id: goal.id, data: { value: 1 } })
    }
  }

  const editFormValues = editForm.watch()

  const renderEditFormOrContent = () => {
    if (!selectedDay?.log) return null

    if (isEditing) {
      return (
        <IntegrityEditForm
          score={editFormValues.score}
          successNote={editFormValues.successNote}
          missedNote={editFormValues.missedNote}
          isPending={updateWorkLog.isPending}
          onScoreChange={(v) => editForm.setValue('score', v)}
          onSuccessNoteChange={(v) => editForm.setValue('successNote', v)}
          onMissedNoteChange={(v) => editForm.setValue('missedNote', v)}
          onSave={handleEditSave}
          onCancel={handleEditCancel}
        />
      )
    }

    return <DayNotesContent log={selectedDay.log} />
  }

  const submitBtnClass = submitSuccess
    ? 'closing-event-view__submit-btn closing-event-view__submit-btn--success'
    : submitReflection.isError
      ? 'closing-event-view__submit-btn closing-event-view__submit-btn--error'
      : 'closing-event-view__submit-btn'

  if (isLoading) {
    return (
      <div className="closing-event-view__loading">
        <div>Loading weekly data...</div>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="closing-event-view__empty">
        <div>No data available</div>
      </div>
    )
  }

  return (
    <div className="closing-event-view">
      <header className="closing-event-view__header">
        <div className="closing-event-view__header-inner">
          <div>
            <h1 className="closing-event-view__title">
              Weekly Closing Event
            </h1>
            <p className="closing-event-view__date-range">
              {summary.weekStart} → {summary.weekEnd}
            </p>
          </div>
          <div className="closing-event-view__rate-group">
            <div className="closing-event-view__rate">
              {summary.integrityRate}%
            </div>
            <div className="closing-event-view__rate-label">Integrity Rate</div>
          </div>
        </div>
      </header>

      <div className="closing-event-view__layout">
        {/* Left Pane: Data Audit */}
        <div className="closing-event-view__left-pane">
          <h2 className="closing-event-view__section-title">
            Data Audit
          </h2>

          <IntegrityHeatmap
            workLogs={summary.workLogs}
            weekStart={summary.weekStart}
            onDayClick={handleDayClick}
          />

          {!isMobile && selectedDay?.log && (
            <DayNotesInline
              date={selectedDay.date}
              integrityScore={selectedDay.log.integrityScore}
              isEditing={isEditing}
              onEditClick={handleEditClick}
              onClose={() => { setSelectedDay(null); setIsEditing(false) }}
            >
              {renderEditFormOrContent()}
            </DayNotesInline>
          )}

          <SpendingChart
            expensesByCategory={summary.expensesByCategory}
            totalExpenses={summary.totalExpenses}
          />

          <GoalsProgress
            goals={summary.goals}
            expandedGoalId={expandedGoalId}
            expandedGoalLogs={expandedGoalLogs}
            isLogsLoading={isLogsLoading}
            isLogging={logGoalProgress.isPending}
            onGoalToggle={handleGoalToggle}
            onQuickLog={handleQuickLog}
          />

          <div className="closing-event-view__stats-grid">
            <div className="closing-event-view__stat">
              <div className="closing-event-view__stat-label">Total Expenses</div>
              <div className="closing-event-view__stat-value">
                {formatCurrency(summary.totalExpenses)}
              </div>
            </div>
            <div className="closing-event-view__stat">
              <div className="closing-event-view__stat-label">Days Logged</div>
              <div className="closing-event-view__stat-value">
                {summary.workLogs.filter(l => l.integrityScore !== null).length}/7
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane: Reflection */}
        <div className="closing-event-view__right-pane">
          <div className="closing-event-view__reflection-header">
            <h2 className="closing-event-view__section-title">
              Weekly Reflection
            </h2>
            <div className="closing-event-view__template-actions">
              {autoPopulatedContent && !reflection && (
                <button
                  onClick={handleUseTemplate}
                  className="closing-event-view__template-btn"
                >
                  Use Template
                </button>
              )}
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="closing-event-view__preview-btn"
              >
                {showPreview ? 'Edit' : 'Preview'}
              </button>
            </div>
          </div>

          {summary.missedOpportunityNotes.length > 0 && !reflection && (
            <div className="closing-event-view__missed-banner">
              <div className="closing-event-view__missed-count">
                {summary.missedOpportunityNotes.length} missed opportunity notes this week
              </div>
              <div className="closing-event-view__missed-hint">
                Click "Use Template" to auto-populate your reflection
              </div>
            </div>
          )}

          {showPreview ? (
            <div className="closing-event-view__preview markdown-content">
              {reflection ? (
                <ReactMarkdown>{reflection}</ReactMarkdown>
              ) : (
                <div className="closing-event-view__preview-empty">
                  Nothing to preview yet. Write your reflection first.
                </div>
              )}
            </div>
          ) : (
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder={`## Points to Improve\n\n- What patterns did you notice?\n- What will you change next week?\n- What went well?\n\nUse markdown for formatting...`}
              className="closing-event-view__textarea"
            />
          )}

          <div className="closing-event-view__submit-bar">
            <button
              className={submitBtnClass}
              onClick={handleSubmitReflection}
              disabled={submitReflection.isPending || !reflection}
            >
              {submitReflection.isPending
                ? 'Submitting...'
                : submitSuccess
                  ? <><FontAwesomeIcon icon={faCheck} className="closing-event-view__submit-icon" />Submitted</>
                  : submitReflection.isError
                    ? 'Failed — Retry'
                    : 'Submit Reflection'}
            </button>
            <span className="closing-event-view__char-count">{reflection.length} characters</span>
          </div>
        </div>
      </div>

      {isMobile && selectedDay?.log && (
        <DayNotesModal
          date={selectedDay.date}
          integrityScore={selectedDay.log.integrityScore}
          isEditing={isEditing}
          onEditClick={handleEditClick}
          onClose={() => { setSelectedDay(null); setIsEditing(false) }}
        >
          {isEditing ? (
            <IntegrityEditForm
              score={editFormValues.score}
              successNote={editFormValues.successNote}
              missedNote={editFormValues.missedNote}
              isPending={updateWorkLog.isPending}
              onScoreChange={(v) => editForm.setValue('score', v)}
              onSuccessNoteChange={(v) => editForm.setValue('successNote', v)}
              onMissedNoteChange={(v) => editForm.setValue('missedNote', v)}
              onSave={handleEditSave}
              onCancel={handleEditCancel}
            />
          ) : (
            <>
              <DayNotesContent log={selectedDay.log} />
              <button
                onClick={() => { setSelectedDay(null); setIsEditing(false) }}
                className="closing-event-view__modal-close-btn btn btn-ghost"
              >
                Close
              </button>
            </>
          )}
        </DayNotesModal>
      )}
    </div>
  )
}

export default ClosingEventView
