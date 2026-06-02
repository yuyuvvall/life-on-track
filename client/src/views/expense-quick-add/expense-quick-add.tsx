import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useCreateExpense, useUpdateExpense, useExpense, useCreateRecurringExpense } from '@/hooks'
import { useCategories } from '@/hooks/useCategories'
import { CURRENCY_SYMBOL } from '@/utils/currency'
import { WEEK_DAY_NAMES } from '@/utils/dateConstants'
import type { RecurrenceType } from '@/types'
import KeypadButton from './keypad-button'
import RecurringOptionsModal from './recurring-options-modal'
import DatePickerModal from './date-picker-modal'
import TagChipRow from '@/components/tag-chip-row'
import TagManageModal from '@/components/tag-manage-modal'
import './expense-quick-add.less'

const parseInitialDate = (dateParam: string | null): Date => {
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return new Date()
  const [y, m, d] = dateParam.split('-').map(Number)
  const now = new Date()
  // Anchor at the given calendar day with the current wall-clock time so
  // per-day ordering stays sensible.
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds())
}

// Serialize the picked date's local calendar fields into an ISO string
// *without* converting to UTC. `.toISOString()` would shift a Jun 1 00:00
// local pick to May 31 21:00 UTC for any UTC+ timezone, and the server's
// DATE(created_at) would file it under the wrong day.
const localCalendarToIso = (d: Date): string =>
  new Date(Date.UTC(
    d.getFullYear(), d.getMonth(), d.getDate(),
    d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()
  )).toISOString()

const ExpenseQuickAdd = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const expenseId = id ? parseInt(id, 10) : undefined
  const isEditMode = expenseId !== undefined

  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()
  const createRecurringExpense = useCreateRecurringExpense()
  const { data: existingExpense, isLoading: isLoadingExpense } = useExpense(expenseId)
  const { data: categories = [] } = useCategories()

  const [amount, setAmount] = useState('0')
  const [category, setCategory] = useState<string>('Food')
  const [note, setNote] = useState('')
  const [tagId, setTagId] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => parseInitialDate(searchParams.get('date')))
  const [showDatePicker, setShowDatePicker] = useState(false)

  const [saveAsTagOpen, setSaveAsTagOpen] = useState(false)

  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('monthly')
  const [recurrenceDay, setRecurrenceDay] = useState(1)
  const [showRecurringOptions, setShowRecurringOptions] = useState(false)

  useEffect(() => {
    if (existingExpense) {
      setAmount(existingExpense.amount.toString())
      setCategory(existingExpense.category)
      setNote(existingExpense.note || '')
      setSelectedDate(new Date(existingExpense.createdAt))
      setTagId(existingExpense.tagId)
    }
  }, [existingExpense])

  // Once categories load, ensure selected category exists in the list (first non-archived).
  useEffect(() => {
    if (categories.length === 0) return
    if (existingExpense) return
    const exists = categories.some((c) => c.name === category)
    if (!exists) setCategory(categories[0].name)
  }, [categories, existingExpense, category])

  const isPending = createExpense.isPending || updateExpense.isPending || createRecurringExpense.isPending

  const handleKeyPress = (key: string) => {
    if (key === 'backspace') {
      setAmount(prev => prev.length > 1 ? prev.slice(0, -1) : '0')
    } else if (key === '.') {
      if (!amount.includes('.')) setAmount(prev => prev + '.')
    } else if (key === 'clear') {
      setAmount('0')
    } else {
      if (amount === '0' && key !== '.') {
        setAmount(key)
      } else {
        const parts = amount.split('.')
        if (parts[1] && parts[1].length >= 2) return
        setAmount(prev => prev + key)
      }
    }
  }

  const handleSubmit = () => {
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return

    if (isRecurring && !isEditMode) {
      createRecurringExpense.mutate(
        {
          amount: parsedAmount,
          category,
          note: note || undefined,
          recurrenceType,
          recurrenceDay,
          tagId: tagId ?? undefined,
        },
        { onSuccess: () => navigate(-1) }
      )
    } else if (isEditMode && expenseId) {
      updateExpense.mutate(
        {
          id: expenseId,
          data: {
            amount: parsedAmount,
            category,
            note: note || undefined,
            createdAt: localCalendarToIso(selectedDate),
            tagId: tagId,
          },
        },
        { onSuccess: () => navigate(-1) }
      )
    } else {
      createExpense.mutate(
        {
          amount: parsedAmount,
          category,
          note: note || undefined,
          createdAt: localCalendarToIso(selectedDate),
          tagId: tagId ?? undefined,
        },
        { onSuccess: () => navigate(-1) }
      )
    }
  }

  const formatDate = (date: Date) => {
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
      return `Today, ${date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }

  const getRecurrenceLabel = () => {
    if (recurrenceType === 'weekly') return `Every ${WEEK_DAY_NAMES[recurrenceDay]}`
    return `Every month on the ${recurrenceDay}${getOrdinalSuffix(recurrenceDay)}`
  }

  const getOrdinalSuffix = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return s[(v - 20) % 10] || s[v] || s[0]
  }

  if (isLoadingExpense && isEditMode) {
    return (
      <div className="expense-quick-add expense-quick-add--loading">
        <div className="expense-quick-add__loading-text">Loading...</div>
      </div>
    )
  }

  return (
    <div className="expense-quick-add">
      <header className="expense-quick-add__header">
        <button onClick={() => navigate(-1)} className="expense-quick-add__back-btn">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="expense-quick-add__page-title">
          {isEditMode ? 'Edit Expense' : 'Add Expense'}
        </h1>
        <div className="expense-quick-add__header-actions">
          {!isEditMode && (
            <button
              type="button"
              onClick={() => setShowRecurringOptions(true)}
              className={`expense-quick-add__recurring-pill${
                isRecurring ? ' expense-quick-add__recurring-pill--on' : ''
              }`}
            >
              <span aria-hidden>🔄</span>
              {isRecurring ? (recurrenceType === 'weekly' ? 'Weekly' : 'Monthly') : 'One-time'}
            </button>
          )}
          {(isEditMode || !isRecurring) && (
            <button onClick={() => setShowDatePicker(true)} className="expense-quick-add__date-btn">
              {formatDate(selectedDate).split(',')[0]}
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className="expense-quick-add__categories">
        <div className="expense-quick-add__category-scroll">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.name)}
              className={`expense-quick-add__category-btn${
                category === cat.name ? ' expense-quick-add__category-btn--selected' : ''
              }`}
            >
              <div
                className={`expense-quick-add__category-circle${
                  category === cat.name ? ' expense-quick-add__category-circle--active' : ''
                }`}
                style={category === cat.name ? { backgroundColor: cat.color } : undefined}
              >
                {cat.icon}
              </div>
              <span
                className={`expense-quick-add__category-label${
                  category === cat.name ? ' expense-quick-add__category-label--active' : ''
                }`}
              >
                {cat.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <TagChipRow
        mode="prefill"
        selectedTagId={tagId}
        onSelect={(tag) => {
          if (tag === null) {
            setTagId(null)
            return
          }
          setTagId(tag.id)
          setAmount(String(tag.amount))
          setCategory(tag.category)
          setNote(tag.note ?? '')
        }}
      />

      <div className="expense-quick-add__amount-section">
        <p className="expense-quick-add__amount-label">
          {isRecurring ? 'Recurring Amount' : 'Expense'}
        </p>
        <p className="expense-quick-add__amount-display">
          <span className="expense-quick-add__currency">{CURRENCY_SYMBOL}</span> {amount}
        </p>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notes..."
          className="expense-quick-add__notes-input"
        />
      </div>

      <button
        type="button"
        className="expense-quick-add__save-as-tag"
        onClick={() => setSaveAsTagOpen(true)}
        disabled={parseFloat(amount) <= 0}
      >
        💾 Save as tag
      </button>

      <div className="expense-quick-add__keypad">
        <div className="expense-quick-add__keypad-grid">
          <KeypadButton label="÷" onClick={() => {}} disabled variant="operator" />
          <KeypadButton label="7" onClick={() => handleKeyPress('7')} />
          <KeypadButton label="8" onClick={() => handleKeyPress('8')} />
          <KeypadButton label="9" onClick={() => handleKeyPress('9')} />
          <KeypadButton label="⌫" onClick={() => handleKeyPress('backspace')} variant="delete" />

          <KeypadButton label="×" onClick={() => {}} disabled variant="operator" />
          <KeypadButton label="4" onClick={() => handleKeyPress('4')} />
          <KeypadButton label="5" onClick={() => handleKeyPress('5')} />
          <KeypadButton label="6" onClick={() => handleKeyPress('6')} />
          <KeypadButton
            label="📅"
            onClick={() => isRecurring ? setShowRecurringOptions(true) : setShowDatePicker(true)}
            variant="calendar"
          />

          <KeypadButton label="−" onClick={() => {}} disabled variant="operator" />
          <KeypadButton label="1" onClick={() => handleKeyPress('1')} />
          <KeypadButton label="2" onClick={() => handleKeyPress('2')} />
          <KeypadButton label="3" onClick={() => handleKeyPress('3')} />
          <button
            onClick={handleSubmit}
            disabled={isPending || parseFloat(amount) <= 0}
            className="expense-quick-add__submit-key"
          >
            {isPending ? (
              <svg className="expense-quick-add__spinner" fill="none" viewBox="0 0 24 24">
                <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

          <KeypadButton label="+" onClick={() => {}} disabled variant="operator" />
          <KeypadButton label={CURRENCY_SYMBOL} onClick={() => {}} disabled variant="operator" />
          <KeypadButton label="0" onClick={() => handleKeyPress('0')} />
          <KeypadButton label="." onClick={() => handleKeyPress('.')} />
        </div>
      </div>

      <div className="expense-quick-add__date-footer">
        {isRecurring ? getRecurrenceLabel() : formatDate(selectedDate)}
      </div>

      {showDatePicker && (
        <DatePickerModal
          selectedDate={selectedDate}
          onSelect={(date) => { setSelectedDate(date); setShowDatePicker(false) }}
          onCancel={() => setShowDatePicker(false)}
        />
      )}

      {showRecurringOptions && (
        <RecurringOptionsModal
          recurrenceType={recurrenceType}
          recurrenceDay={recurrenceDay}
          isRecurring={isRecurring}
          onSave={(type, day) => {
            setRecurrenceType(type)
            setRecurrenceDay(day)
            setIsRecurring(true)
            setShowRecurringOptions(false)
          }}
          onTurnOff={() => {
            setIsRecurring(false)
            setShowRecurringOptions(false)
          }}
          onCancel={() => setShowRecurringOptions(false)}
        />
      )}

      {saveAsTagOpen && (() => {
        const selectedCat = categories.find((c) => c.name === category)
        return (
          <TagManageModal
            initialMode="create"
            initialDraft={{
              name: note || category,
              category,
              amount: parseFloat(amount) || 0,
              note: note || undefined,
              icon: selectedCat?.icon ?? '📦',
              color: selectedCat?.color ?? '#6b7280',
            }}
            onCreated={(tag) => setTagId(tag.id)}
            onClose={() => setSaveAsTagOpen(false)}
          />
        )
      })()}
    </div>
  )
}

export default ExpenseQuickAdd
