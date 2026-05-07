import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useCreateExpense, useUpdateExpense, useExpense, useCreateRecurringExpense } from '@/hooks'
import { WEEK_DAY_NAMES } from '@/utils/dateConstants'
import type { RecurrenceType } from '@/types'
import KeypadButton from './keypad-button'
import RecurringOptionsModal from './recurring-options-modal'
import DatePickerModal from './date-picker-modal'
import TagChipRow from '@/components/tag-chip-row'
import TagManageModal from '@/components/tag-manage-modal'
import './expense-quick-add.less'

const CATEGORIES = [
  { id: 'Food', icon: '🍴', color: '#f97316' },
  { id: 'Groceries', icon: '🛒', color: '#3b82f6' },
  { id: 'Transport', icon: '🚌', color: '#f59e0b' },
  { id: 'Shopping', icon: '🛍️', color: '#ec4899' },
  { id: 'Bills', icon: '📄', color: '#64748b' },
  { id: 'Entertainment', icon: '🎮', color: '#a855f7' },
  { id: 'Health', icon: '💊', color: '#10b981' },
  { id: 'Other', icon: '📦', color: '#6b7280' },
] as const

type CategoryId = typeof CATEGORIES[number]['id']

const parseInitialDate = (dateParam: string | null): Date => {
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return new Date()
  const [y, m, d] = dateParam.split('-').map(Number)
  const now = new Date()
  // Anchor at the given calendar day with the current wall-clock time so
  // per-day ordering stays sensible.
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds())
}

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

  const [amount, setAmount] = useState('0')
  const [category, setCategory] = useState<CategoryId>('Food')
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
      setCategory(existingExpense.category as CategoryId)
      setNote(existingExpense.note || '')
      setSelectedDate(new Date(existingExpense.createdAt))
      setTagId(existingExpense.tagId)
    }
  }, [existingExpense])

  const selectedCat = CATEGORIES.find(c => c.id === category)!
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
            createdAt: selectedDate.toISOString(),
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
          createdAt: selectedDate.toISOString(),
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
        {!isEditMode && !isRecurring && (
          <button onClick={() => setShowDatePicker(true)} className="expense-quick-add__date-btn">
            {formatDate(selectedDate).split(',')[0]}
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
        {isEditMode && (
          <button onClick={() => setShowDatePicker(true)} className="expense-quick-add__date-btn">
            {formatDate(selectedDate).split(',')[0]}
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
        {!isEditMode && isRecurring && <div className="expense-quick-add__header-spacer" />}
      </header>

      <div className="expense-quick-add__categories">
        <div className="expense-quick-add__category-scroll">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`expense-quick-add__category-btn${
                category === cat.id ? ' expense-quick-add__category-btn--selected' : ''
              }`}
            >
              <div
                className={`expense-quick-add__category-circle${
                  category === cat.id ? ' expense-quick-add__category-circle--active' : ''
                }`}
                style={category === cat.id ? { backgroundColor: cat.color } : undefined}
              >
                {cat.icon}
              </div>
              <span
                className={`expense-quick-add__category-label${
                  category === cat.id ? ' expense-quick-add__category-label--active' : ''
                }`}
              >
                {cat.id}
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
          setCategory(tag.category as CategoryId)
          setNote(tag.note ?? '')
        }}
      />

      <div className="expense-quick-add__banner">
        <div>
          <p className="expense-quick-add__banner-text">Category</p>
          <p className="expense-quick-add__banner-name">{category}</p>
        </div>
        <div className="expense-quick-add__banner-icon">
          {selectedCat.icon}
        </div>
      </div>

      {!isEditMode && (
        <div className="expense-quick-add__recurring-toggle">
          <div className="expense-quick-add__recurring-row">
            <div className="expense-quick-add__recurring-info">
              <span className="expense-quick-add__recurring-icon">🔄</span>
              <div>
                <p className="expense-quick-add__recurring-title">Recurring Expense</p>
                {isRecurring && (
                  <p className="expense-quick-add__recurring-schedule">{getRecurrenceLabel()}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (!isRecurring) { setIsRecurring(true); setShowRecurringOptions(true) }
                else setIsRecurring(false)
              }}
              className={`expense-quick-add__toggle-switch${
                isRecurring ? ' expense-quick-add__toggle-switch--on' : ''
              }`}
            >
              <div
                className={`expense-quick-add__toggle-knob${
                  isRecurring ? ' expense-quick-add__toggle-knob--on' : ''
                }`}
              />
            </button>
          </div>
          {isRecurring && (
            <button
              onClick={() => setShowRecurringOptions(true)}
              className="expense-quick-add__change-schedule"
            >
              Change schedule
            </button>
          )}
        </div>
      )}

      <div className="expense-quick-add__amount-section">
        <p className="expense-quick-add__amount-label">
          {isRecurring ? 'Recurring Amount' : 'Expense'}
        </p>
        <p className="expense-quick-add__amount-display">
          <span className="expense-quick-add__currency">₪</span> {amount}
        </p>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notes..."
          className="expense-quick-add__notes-input"
        />
      </div>

      {!isEditMode && (
        <button
          type="button"
          className="expense-quick-add__save-as-tag"
          onClick={() => setSaveAsTagOpen(true)}
          disabled={parseFloat(amount) <= 0}
        >
          💾 Save as tag
        </button>
      )}

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
          <KeypadButton label="₪" onClick={() => {}} disabled variant="operator" />
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
          onSave={(type, day) => {
            setRecurrenceType(type)
            setRecurrenceDay(day)
            setShowRecurringOptions(false)
          }}
          onCancel={() => setShowRecurringOptions(false)}
        />
      )}

      {saveAsTagOpen && (
        <TagManageModal
          initialMode="create"
          initialDraft={{
            name: note || category,
            category,
            amount: parseFloat(amount) || 0,
            note: note || undefined,
            icon: selectedCat.icon,
            color: selectedCat.color,
          }}
          onClose={() => setSaveAsTagOpen(false)}
        />
      )}
    </div>
  )
}

export default ExpenseQuickAdd
