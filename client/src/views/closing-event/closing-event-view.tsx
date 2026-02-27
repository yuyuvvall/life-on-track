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
import DayNotesContent from './day-notes-content'
import IntegrityEditForm from './integrity-edit-form'
import DayNotesModal from './day-notes-modal'
import DayNotesInline from './day-notes-inline'
import type { WorkLog, Goal } from '@/types'

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-gray-500">Loading weekly data...</div>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-gray-500">No data available</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-900">
      <header className="sticky top-0 z-30 bg-surface-900/95 backdrop-blur-sm border-b border-surface-700">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-100 mt-1">
              Weekly Closing Event
            </h1>
            <p className="text-xs text-gray-500 font-mono">
              {summary.weekStart} → {summary.weekEnd}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-gray-100">
              {summary.integrityRate}%
            </div>
            <div className="text-xs text-gray-500">Integrity Rate</div>
          </div>
        </div>
      </header>

      <div className="lg:flex lg:h-[calc(100vh-80px)]">
        {/* Left Pane: Data Audit */}
        <div className="lg:w-1/2 lg:border-r lg:border-surface-700 lg:overflow-y-auto p-4 space-y-4">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-700 rounded-lg p-3">
              <div className="text-xs text-gray-500">Total Expenses</div>
              <div className="font-mono text-lg text-gray-100">
                ${summary.totalExpenses.toFixed(2)}
              </div>
            </div>
            <div className="bg-surface-700 rounded-lg p-3">
              <div className="text-xs text-gray-500">Days Logged</div>
              <div className="font-mono text-lg text-gray-100">
                {summary.workLogs.filter(l => l.integrityScore !== null).length}/7
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane: Reflection */}
        <div className="lg:w-1/2 lg:overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Weekly Reflection
            </h2>
            <div className="flex gap-2">
              {autoPopulatedContent && !reflection && (
                <button
                  onClick={handleUseTemplate}
                  className="text-xs text-accent-blue hover:text-blue-400"
                >
                  Use Template
                </button>
              )}
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                {showPreview ? 'Edit' : 'Preview'}
              </button>
            </div>
          </div>

          {summary.missedOpportunityNotes.length > 0 && !reflection && (
            <div className="bg-surface-700 rounded-lg p-3 border-l-2 border-accent-amber">
              <div className="text-xs text-accent-amber mb-1">
                {summary.missedOpportunityNotes.length} missed opportunity notes this week
              </div>
              <div className="text-xs text-gray-500">
                Click "Use Template" to auto-populate your reflection
              </div>
            </div>
          )}

          {showPreview ? (
            <div className="bg-surface-700 rounded-lg p-4 min-h-[300px] markdown-content">
              {reflection ? (
                <ReactMarkdown>{reflection}</ReactMarkdown>
              ) : (
                <div className="text-gray-500 text-sm">
                  Nothing to preview yet. Write your reflection first.
                </div>
              )}
            </div>
          ) : (
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder={`## Points to Improve\n\n- What patterns did you notice?\n- What will you change next week?\n- What went well?\n\nUse markdown for formatting...`}
              className="w-full h-[400px] lg:h-[calc(100vh-240px)] bg-surface-700 rounded-lg p-4
                       text-sm font-mono resize-none"
            />
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <button
              className={`btn btn-ghost border text-sm ${
                submitSuccess
                  ? 'border-accent-green text-accent-green'
                  : submitReflection.isError
                    ? 'border-accent-red text-accent-red'
                    : 'border-gray-500 text-gray-500 hover:text-gray-300 hover:border-gray-300'
              }`}
              onClick={handleSubmitReflection}
              disabled={submitReflection.isPending || !reflection}
            >
              {submitReflection.isPending
                ? 'Submitting...'
                : submitSuccess
                  ? <><FontAwesomeIcon icon={faCheck} className="mr-1" />Submitted</>
                  : submitReflection.isError
                    ? 'Failed — Retry'
                    : 'Submit Reflection'}
            </button>
            <span>{reflection.length} characters</span>
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
                className="btn btn-ghost w-full mt-4"
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
