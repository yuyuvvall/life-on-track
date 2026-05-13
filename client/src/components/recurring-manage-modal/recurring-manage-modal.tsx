import { useMemo, useState } from 'react'
import {
  useRecurringExpenses,
  useUpdateRecurringExpense,
  useDeleteRecurringExpense,
  useCreateRecurringExpense,
} from '@/hooks/useExpenses'
import { useCategories } from '@/hooks/useCategories'
import { useTags } from '@/hooks/useTags'
import { showToast } from '@/store/toastStore'
import { formatCurrency, CURRENCY_SYMBOL } from '@/utils/currency'
import { WEEK_DAY_NAMES } from '@/utils/dateConstants'
import RecurringOptionsModal from '@/views/expense-quick-add/recurring-options-modal'
import type {
  Category,
  RecurrenceType,
  RecurringExpense,
  Tag,
  UpdateRecurringExpenseRequest,
} from '@/types'
import './recurring-manage-modal.less'

export type RecurringManageModalProps = {
  initialMode?: 'list' | 'edit'
  initialEditId?: number
  onClose: () => void
}

type FormState = {
  amount: string
  category: string
  note: string
  recurrenceType: RecurrenceType
  recurrenceDay: number
  tagId: number | null
}

const FALLBACK_ICON = '📦'
const FALLBACK_COLOR = '#6b7280'

const ordinalSuffix = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

const scheduleLabel = (type: RecurrenceType, day: number) => {
  if (type === 'weekly') return `Every ${WEEK_DAY_NAMES[day]}`
  return `Every month on the ${day}${ordinalSuffix(day)}`
}

const recurringToForm = (r: RecurringExpense): FormState => ({
  amount: String(r.amount),
  category: r.category,
  note: r.note ?? '',
  recurrenceType: r.recurrenceType,
  recurrenceDay: r.recurrenceDay,
  tagId: r.tagId,
})

const RecurringManageModal = ({
  initialMode = 'list',
  initialEditId,
  onClose,
}: RecurringManageModalProps) => {
  const [mode, setMode] = useState<'list' | 'edit'>(initialMode)
  const [editingId, setEditingId] = useState<number | undefined>(initialEditId)
  const [form, setForm] = useState<FormState>({
    amount: '0',
    category: '',
    note: '',
    recurrenceType: 'monthly',
    recurrenceDay: 1,
    tagId: null,
  })
  const [error, setError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [showSchedulePicker, setShowSchedulePicker] = useState(false)

  const { data: recurring = [], isLoading } = useRecurringExpenses()
  const { data: categories = [] } = useCategories()
  const { data: tags = [] } = useTags(false)

  const updateRecurring = useUpdateRecurringExpense()
  const deleteRecurring = useDeleteRecurringExpense()
  const createRecurring = useCreateRecurringExpense()

  const categoriesByName = useMemo(() => {
    const m = new Map<string, Category>()
    for (const c of categories) m.set(c.name.toLowerCase(), c)
    return m
  }, [categories])
  const tagsById = useMemo(() => {
    const m = new Map<number, Tag>()
    for (const t of tags) m.set(t.id, t)
    return m
  }, [tags])

  const lookupCategory = (name: string): Category | undefined =>
    categoriesByName.get(name.toLowerCase())

  // Active first, then most-recently-created.
  const sortedRecurring = useMemo(
    () =>
      [...recurring].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }),
    [recurring],
  )

  const startEdit = (r: RecurringExpense) => {
    setForm(recurringToForm(r))
    setEditingId(r.id)
    setMode('edit')
    setError(null)
  }

  const cancelEdit = () => {
    setMode('list')
    setEditingId(undefined)
    setError(null)
  }

  const handleSave = () => {
    setError(null)
    if (editingId === undefined) return
    const amountNum = parseFloat(form.amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return setError('Amount must be greater than 0')
    }
    if (!form.category) return setError('Category is required')

    const payload: UpdateRecurringExpenseRequest = {
      amount: amountNum,
      category: form.category,
      note: form.note || undefined,
      recurrenceType: form.recurrenceType,
      recurrenceDay: form.recurrenceDay,
    }
    // Only forward tagId when it's explicitly null (clear) or maps to a tag
    // still visible in the active picker. A stale id pointing at an archived
    // tag would be rejected by the backend.
    if (form.tagId === null || tagsById.has(form.tagId)) {
      payload.tagId = form.tagId
    }

    updateRecurring.mutate(
      { id: editingId, data: payload },
      {
        onSuccess: () => {
          showToast({ message: 'Recurring expense updated', variant: 'info' })
          cancelEdit()
        },
        onError: () => setError('Failed to save changes'),
      },
    )
  }

  const handleTogglePause = (r: RecurringExpense) => {
    updateRecurring.mutate({
      id: r.id,
      data: { isActive: !r.isActive },
    })
  }

  const handleDelete = (r: RecurringExpense) => {
    if (confirmDeleteId !== r.id) {
      setConfirmDeleteId(r.id)
      // Auto-clear confirmation after a moment so a stale "tap again" doesn't
      // delete something the user moved on from.
      setTimeout(() => {
        setConfirmDeleteId((curr) => (curr === r.id ? null : curr))
      }, 3000)
      return
    }
    setConfirmDeleteId(null)
    deleteRecurring.mutate(r.id, {
      onSuccess: () => {
        showToast({
          message: `Deleted recurring ${r.category}`,
          variant: 'info',
          durationMs: 5000,
          action: {
            label: 'Undo',
            onClick: () => {
              createRecurring.mutate({
                amount: r.amount,
                category: r.category,
                note: r.note ?? undefined,
                recurrenceType: r.recurrenceType,
                recurrenceDay: r.recurrenceDay,
                tagId: r.tagId ?? undefined,
              })
            },
          },
        })
      },
    })
  }

  const renderListRow = (r: RecurringExpense) => {
    const cat = lookupCategory(r.category)
    const tag = r.tagId !== null ? tagsById.get(r.tagId) : undefined
    const isConfirming = confirmDeleteId === r.id
    return (
      <div
        key={r.id}
        className={`recurring-manage-modal__row${
          r.isActive ? '' : ' recurring-manage-modal__row--paused'
        }`}
      >
        <div
          className="recurring-manage-modal__row-icon"
          style={{ backgroundColor: cat?.color ?? FALLBACK_COLOR }}
        >
          {cat?.icon ?? FALLBACK_ICON}
        </div>
        <div className="recurring-manage-modal__row-detail">
          <div className="recurring-manage-modal__row-title">
            <span className="recurring-manage-modal__row-amount">
              {formatCurrency(r.amount)}
            </span>
            <span className="recurring-manage-modal__row-category">{r.category}</span>
            {!r.isActive && (
              <span className="recurring-manage-modal__paused-badge">Paused</span>
            )}
          </div>
          <p className="recurring-manage-modal__row-schedule">
            {scheduleLabel(r.recurrenceType, r.recurrenceDay)}
          </p>
          {r.note && (
            <p className="recurring-manage-modal__row-note">{r.note}</p>
          )}
          {tag && (
            <span
              className="recurring-manage-modal__row-tag"
              style={{ borderColor: tag.color }}
            >
              <span
                className="recurring-manage-modal__row-tag-icon"
                style={{ backgroundColor: tag.color }}
              >
                {tag.icon}
              </span>
              <span className="recurring-manage-modal__row-tag-name">{tag.name}</span>
            </span>
          )}
        </div>
        <div className="recurring-manage-modal__row-actions">
          <button
            type="button"
            className="recurring-manage-modal__row-btn"
            onClick={() => handleTogglePause(r)}
            aria-label={r.isActive ? 'Pause' : 'Resume'}
            title={r.isActive ? 'Pause' : 'Resume'}
          >
            {r.isActive ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            className="recurring-manage-modal__row-btn"
            onClick={() => startEdit(r)}
            aria-label="Edit"
          >
            ✏️
          </button>
          <button
            type="button"
            className={`recurring-manage-modal__row-btn${
              isConfirming ? ' recurring-manage-modal__row-btn--danger' : ''
            }`}
            onClick={() => handleDelete(r)}
            aria-label={isConfirming ? 'Confirm delete' : 'Delete'}
            title={isConfirming ? 'Tap again to delete' : 'Delete'}
          >
            {isConfirming ? '✓' : '🗑'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="recurring-manage-modal__backdrop" onClick={onClose}>
      <div
        className="recurring-manage-modal__card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="recurring-manage-modal__header">
          <h3>{mode === 'list' ? 'Recurring expenses' : 'Edit recurring'}</h3>
          <button
            type="button"
            className="recurring-manage-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {mode === 'list' && (
          <div className="recurring-manage-modal__body">
            {isLoading ? (
              <p className="recurring-manage-modal__empty">Loading…</p>
            ) : sortedRecurring.length === 0 ? (
              <div className="recurring-manage-modal__empty">
                <p className="recurring-manage-modal__empty-title">
                  No recurring expenses yet
                </p>
                <p className="recurring-manage-modal__empty-hint">
                  Create one from the + Add screen — toggle the 🔄 pill before saving.
                </p>
              </div>
            ) : (
              sortedRecurring.map(renderListRow)
            )}
          </div>
        )}

        {mode === 'edit' && (
          <div className="recurring-manage-modal__body">
            <label className="recurring-manage-modal__field">
              <span className="recurring-manage-modal__field-label">Amount</span>
              <div className="recurring-manage-modal__amount-input">
                <span className="recurring-manage-modal__amount-prefix">
                  {CURRENCY_SYMBOL}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
              </div>
            </label>

            <div className="recurring-manage-modal__field">
              <span className="recurring-manage-modal__field-label">Category</span>
              <div className="recurring-manage-modal__cat-row">
                {categories.map((c) => {
                  const active = form.category === c.name
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: c.name }))}
                      className={`recurring-manage-modal__cat${
                        active ? ' recurring-manage-modal__cat--active' : ''
                      }`}
                      style={active ? { backgroundColor: c.color } : undefined}
                      aria-label={c.name}
                      title={c.name}
                    >
                      {c.icon}
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="recurring-manage-modal__field">
              <span className="recurring-manage-modal__field-label">Note</span>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Optional"
              />
            </label>

            <div className="recurring-manage-modal__field">
              <span className="recurring-manage-modal__field-label">Schedule</span>
              <button
                type="button"
                className="recurring-manage-modal__schedule-btn"
                onClick={() => setShowSchedulePicker(true)}
              >
                <span>{scheduleLabel(form.recurrenceType, form.recurrenceDay)}</span>
                <span aria-hidden>›</span>
              </button>
            </div>

            <div className="recurring-manage-modal__field">
              <span className="recurring-manage-modal__field-label">Tag</span>
              <div className="recurring-manage-modal__tag-row">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tagId: null }))}
                  className={`recurring-manage-modal__tag${
                    form.tagId === null ? ' recurring-manage-modal__tag--active' : ''
                  }`}
                >
                  No tag
                </button>
                {tags.map((t) => {
                  const active = form.tagId === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tagId: t.id }))}
                      className={`recurring-manage-modal__tag${
                        active ? ' recurring-manage-modal__tag--active' : ''
                      }`}
                      style={{ borderColor: t.color }}
                    >
                      <span
                        className="recurring-manage-modal__tag-icon"
                        style={{ backgroundColor: t.color }}
                      >
                        {t.icon}
                      </span>
                      <span>{t.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {error && <p className="recurring-manage-modal__error">{error}</p>}

            <div className="recurring-manage-modal__actions">
              <button type="button" onClick={cancelEdit}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={updateRecurring.isPending}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {showSchedulePicker && (
          <RecurringOptionsModal
            recurrenceType={form.recurrenceType}
            recurrenceDay={form.recurrenceDay}
            isRecurring={true}
            hideOffOption={true}
            onSave={(type, day) => {
              setForm((f) => ({ ...f, recurrenceType: type, recurrenceDay: day }))
              setShowSchedulePicker(false)
            }}
            onTurnOff={() => setShowSchedulePicker(false)}
            onCancel={() => setShowSchedulePicker(false)}
          />
        )}
      </div>
    </div>
  )
}

export default RecurringManageModal
