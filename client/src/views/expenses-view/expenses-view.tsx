import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useExpensesByDateRange,
  useDeleteExpense,
  useCreateExpense,
  useGenerateRecurringExpenses,
  useBudgetsByMonth,
  useUpsertBudget,
  useDeleteBudget,
  useChangeBudgetFromNow,
  useRemoveBudgetEntirely,
} from '@/hooks'
import { showToast } from '@/store/toastStore'
import { BudgetEditModal, BudgetsBulkModal } from '@/components'
import type { BudgetBulkChange, BudgetBulkEntry } from '@/components'
import TagChipRow from '@/components/tag-chip-row'
import { useTags } from '@/hooks/useTags'
import type { Expense, Tag } from '@/types'
import './expenses-view.less'

const CATEGORY_ICONS: Record<string, string> = {
  'Food': '🍴',
  'Groceries': '🛒',
  'Transport': '🚌',
  'Shopping': '🛍️',
  'Bills': '📄',
  'Entertainment': '🎮',
  'Health': '💊',
  'Other': '📦',
}

const CATEGORY_MODIFIER: Record<string, string> = {
  'Food': 'food',
  'Groceries': 'groceries',
  'Transport': 'transport',
  'Shopping': 'shopping',
  'Bills': 'bills',
  'Entertainment': 'entertainment',
  'Health': 'health',
  'Other': 'other',
}

type ViewMode = 'timeline' | 'category'

type SelectedMonth = { year: number; month: number }

const shiftMonth = ({ year, month }: SelectedMonth, delta: number): SelectedMonth => {
  const next = new Date(year, month + delta, 1)
  return { year: next.getFullYear(), month: next.getMonth() }
}

const ExpensesView = () => {
  const navigate = useNavigate()
  const deleteExpense = useDeleteExpense()
  const createExpense = useCreateExpense()
  const generateRecurring = useGenerateRecurringExpenses()

  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [selectedMonth, setSelectedMonth] = useState<SelectedMonth>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generateRecurring.mutate() }, [])

  const { startDate, endDate, monthName, monthKey, isCurrentMonth } = useMemo(() => {
    const { year, month } = selectedMonth
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const now = new Date()
    return {
      startDate: firstDay.toISOString().split('T')[0],
      endDate: lastDay.toISOString().split('T')[0],
      monthName: firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      monthKey: `${year}-${String(month + 1).padStart(2, '0')}`,
      isCurrentMonth: year === now.getFullYear() && month === now.getMonth(),
    }
  }, [selectedMonth])

  const { data: expenses = [], isLoading } = useExpensesByDateRange(startDate, endDate)
  const { data: budgets = [] } = useBudgetsByMonth(monthKey)
  const { data: allTags = [] } = useTags(true)
  const tagsById = useMemo(() => {
    const map = new Map<number, Tag>()
    for (const t of allTags) map.set(t.id, t)
    return map
  }, [allTags])
  const upsertBudget = useUpsertBudget()
  const deleteBudget = useDeleteBudget(monthKey)
  const changeBudgetFromNow = useChangeBudgetFromNow()
  const removeBudgetEntirely = useRemoveBudgetEntirely()

  const budgetByCategory = useMemo(() => {
    const map: Record<string, { id: number; amount: number; month: string; inheritedFromMonth: string | null }> = {}
    for (const b of budgets) {
      map[b.category] = {
        id: b.id,
        amount: b.amount,
        month: b.month,
        inheritedFromMonth: b.month !== monthKey ? b.month : null,
      }
    }
    return map
  }, [budgets, monthKey])

  const [editingBudgetCategory, setEditingBudgetCategory] = useState<string | null>(null)
  const [showBulkBudgetModal, setShowBulkBudgetModal] = useState(false)

  const bulkBudgetEntries = useMemo<BudgetBulkEntry[]>(
    () => budgets.map(b => ({
      category: b.category,
      currentAmount: b.amount,
      directRowId: b.month === monthKey ? b.id : null,
      inheritedFromMonth: b.month !== monthKey ? b.month : null,
    })),
    [budgets, monthKey]
  )

  const handleBulkBudgetSave = (changes: BudgetBulkChange[]) => {
    setShowBulkBudgetModal(false)
    if (changes.length === 0) return

    const onError = () => showToast({ message: 'Some budgets failed to save', variant: 'error' })
    for (const change of changes) {
      if (change.newAmount > 0) {
        upsertBudget.mutate(
          { category: change.category, month: monthKey, amount: change.newAmount },
          { onError }
        )
      } else if (change.directRowId !== null) {
        deleteBudget.mutate(change.directRowId, { onError })
      } else if (change.wasInherited) {
        upsertBudget.mutate(
          { category: change.category, month: monthKey, amount: 0 },
          { onError }
        )
      }
    }
    showToast({ message: `Saved ${changes.length} budget${changes.length !== 1 ? 's' : ''}`, variant: 'info' })
  }

  const groupedExpenses = useMemo(() => {
    const groups: Record<string, Expense[]> = {}

    expenses.forEach((expense) => {
      const date = new Date(expense.createdAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(expense)
    })

    return Object.entries(groups).sort((a, b) => {
      const dateA = new Date(expenses.find(e =>
        new Date(e.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) === a[0]
      )?.createdAt || 0)
      const dateB = new Date(expenses.find(e =>
        new Date(e.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) === b[0]
      )?.createdAt || 0)
      return dateB.getTime() - dateA.getTime()
    })
  }, [expenses])

  const categoryBreakdown = useMemo(() => {
    const categories: Record<string, { total: number; count: number }> = {}

    expenses.forEach((expense) => {
      if (!categories[expense.category]) {
        categories[expense.category] = { total: 0, count: 0 }
      }
      categories[expense.category].total += expense.amount
      categories[expense.category].count += 1
    })

    // Surface budgeted categories even if nothing has been spent yet this month.
    for (const b of budgets) {
      if (!categories[b.category]) {
        categories[b.category] = { total: 0, count: 0 }
      }
    }

    return Object.entries(categories)
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.total - a.total)
  }, [expenses, budgets])

  const tagBreakdownByCategory = useMemo(() => {
    const result: Record<string, { tag: Tag; total: number; count: number }[]> = {}
    const accum: Record<string, Map<number, { total: number; count: number }>> = {}
    for (const e of expenses) {
      if (e.tagId === null) continue
      if (!accum[e.category]) accum[e.category] = new Map()
      const bucket = accum[e.category]
      const prev = bucket.get(e.tagId) ?? { total: 0, count: 0 }
      bucket.set(e.tagId, { total: prev.total + e.amount, count: prev.count + 1 })
    }
    for (const [category, bucket] of Object.entries(accum)) {
      const rows: { tag: Tag; total: number; count: number }[] = []
      for (const [tagId, stats] of bucket) {
        const tag = tagsById.get(tagId)
        if (!tag) continue
        rows.push({ tag, total: stats.total, count: stats.count })
      }
      rows.sort((a, b) => b.total - a.total)
      result[category] = rows
    }
    return result
  }, [expenses, tagsById])

  const totalSpent = useMemo(() => {
    return expenses.reduce((sum, e) => sum + e.amount, 0)
  }, [expenses])

  const handleDelete = (e: React.MouseEvent, expense: Expense) => {
    e.stopPropagation()
    deleteExpense.mutate(expense.id)
    showToast({
      message: `Deleted ₪${expense.amount.toFixed(2)} ${expense.category}`,
      variant: 'info',
      durationMs: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          createExpense.mutate({
            amount: expense.amount,
            category: expense.category,
            note: expense.note ?? undefined,
            createdAt: expense.createdAt,
          })
        },
      },
    })
  }

  const handleExpenseClick = (id: number) => {
    navigate(`/expense/edit/${id}`)
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const mod = (category: string) => CATEGORY_MODIFIER[category] || 'other'

  return (
    <div className="expenses-view">
      <div className="expenses-view__summary">
        <div className="expenses-view__month-nav">
          <button
            className="expenses-view__month-nav-btn"
            onClick={() => setSelectedMonth(prev => shiftMonth(prev, -1))}
            aria-label="Previous month"
          >‹</button>
          <p className="expenses-view__summary-month">{monthName}</p>
          <button
            className="expenses-view__month-nav-btn"
            onClick={() => setSelectedMonth(prev => shiftMonth(prev, +1))}
            disabled={isCurrentMonth}
            aria-label="Next month"
          >›</button>
        </div>
        <p className="expenses-view__summary-total">₪ {totalSpent.toFixed(2)}</p>
        <p className="expenses-view__summary-count">
          {expenses.length} expense{expenses.length !== 1 ? 's' : ''} {isCurrentMonth ? 'this month' : `in ${monthName}`}
        </p>
      </div>

      <div className="expenses-view__controls">
        <div className="expenses-view__toggle">
          <button
            onClick={() => setViewMode('timeline')}
            className={`expenses-view__toggle-btn${viewMode === 'timeline' ? ' expenses-view__toggle-btn--active' : ''}`}
          >
            Timeline
          </button>
          <button
            onClick={() => setViewMode('category')}
            className={`expenses-view__toggle-btn${viewMode === 'category' ? ' expenses-view__toggle-btn--active' : ''}`}
          >
            By Category
          </button>
        </div>

        <button
          onClick={() => navigate(isCurrentMonth ? '/expense/add' : `/expense/add?date=${endDate}`)}
          className="expenses-view__add-btn"
        >
          <span className="expenses-view__add-icon">+</span>
          <span>Add</span>
        </button>
      </div>

      <TagChipRow mode="quick-add" isCurrentMonth={isCurrentMonth} />

      <div className="expenses-view__content">
        {isLoading ? (
          <div className="expenses-view__loading">Loading...</div>
        ) : expenses.length === 0 && !(viewMode === 'category') ? (
          <div className="expenses-view__empty">
            <p className="expenses-view__empty-title">
              No expenses {isCurrentMonth ? 'this month' : `in ${monthName}`}
            </p>
            <p className="expenses-view__empty-subtitle">
              {isCurrentMonth ? 'Tap + to add your first expense' : 'Nothing was logged for this month'}
            </p>
          </div>
        ) : viewMode === 'timeline' ? (
          groupedExpenses.map(([date, dayExpenses]) => (
            <div key={date} className="expenses-view__date-group">
              <p className="expenses-view__date-header">{date}</p>
              <div className="expenses-view__day-expenses">
                {dayExpenses.map((expense) => (
                  <div
                    key={expense.id}
                    onClick={() => handleExpenseClick(expense.id)}
                    className={`expenses-view__expense-card expenses-view__expense-card--${mod(expense.category)}`}
                  >
                    <div className="expenses-view__expense-icon">
                      {CATEGORY_ICONS[expense.category] || '📦'}
                    </div>
                    <div className="expenses-view__expense-detail">
                      <p className="expenses-view__expense-category">{expense.category}</p>
                      {expense.tagId !== null && tagsById.has(expense.tagId) && (() => {
                        const tag = tagsById.get(expense.tagId)!
                        return (
                          <span
                            className="expenses-view__expense-tag"
                            style={{ borderColor: tag.color }}
                          >
                            <span
                              className="expenses-view__expense-tag-icon"
                              style={{ backgroundColor: tag.color }}
                            >
                              {tag.icon}
                            </span>
                            <span className="expenses-view__expense-tag-name">{tag.name}</span>
                          </span>
                        )
                      })()}
                      {expense.note && (
                        <p className="expenses-view__expense-note">{expense.note}</p>
                      )}
                      <p className="expenses-view__expense-time">{formatTime(expense.createdAt)}</p>
                    </div>
                    <div className="expenses-view__expense-amount">
                      <p>₪ {expense.amount.toFixed(2)}</p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, expense)}
                      className="expenses-view__delete-btn"
                    >
                      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="expenses-view__categories">
            <div className="expenses-view__categories-header">
              <span className="expenses-view__categories-title">
                {categoryBreakdown.length > 0 ? 'Categories' : `No spend or budgets ${isCurrentMonth ? 'this month' : `in ${monthName}`}`}
              </span>
              <button
                className="expenses-view__edit-budgets-btn"
                onClick={() => setShowBulkBudgetModal(true)}
                type="button"
              >
                Edit budgets
              </button>
            </div>
            {categoryBreakdown.map(({ category, total, count }) => {
              const budgetEntry = budgetByCategory[category]
              const budget = budgetEntry?.amount ?? 0
              const hasBudget = budget > 0
              const spentPct = hasBudget
                ? Math.min(100, (total / budget) * 100)
                : (totalSpent > 0 ? (total / totalSpent) * 100 : 0)
              const overBudget = hasBudget && total > budget
              const remaining = hasBudget ? budget - total : 0
              const shareOfWallet = totalSpent > 0 ? (total / totalSpent) * 100 : 0
              const budgetUsedPct = hasBudget ? (total / budget) * 100 : 0
              const inheritedFromMonth = budgetEntry?.inheritedFromMonth ?? null
              const inheritedLabel = inheritedFromMonth
                ? new Date(
                    Number(inheritedFromMonth.split('-')[0]),
                    Number(inheritedFromMonth.split('-')[1]) - 1,
                    1
                  ).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                : null

              return (
                <div key={category} className="expenses-view__category-card">
                  <div className="expenses-view__category-header">
                    <div className={`expenses-view__category-icon expenses-view__category-icon--${mod(category)}`}>
                      {CATEGORY_ICONS[category] || '📦'}
                    </div>
                    <div className="expenses-view__category-info">
                      <div className="expenses-view__category-row">
                        <p className="expenses-view__category-name">{category}</p>
                        <p className="expenses-view__category-amount">₪ {total.toFixed(2)}</p>
                      </div>
                      <div className="expenses-view__category-row">
                        <p className="expenses-view__category-count">
                          {count} expense{count !== 1 ? 's' : ''}
                        </p>
                        <p className="expenses-view__category-pct">{shareOfWallet.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                  {(tagBreakdownByCategory[category]?.length ?? 0) > 0 && (
                    <div className="expenses-view__category-tags">
                      {tagBreakdownByCategory[category]!.map(({ tag, total, count }) => (
                        <span
                          key={tag.id}
                          className="expenses-view__category-tag"
                          style={{ borderColor: tag.color }}
                        >
                          <span
                            className="expenses-view__category-tag-icon"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.icon}
                          </span>
                          <span className="expenses-view__category-tag-name">{tag.name}</span>
                          <span className="expenses-view__category-tag-meta">
                            ₪{total.toFixed(2)} · {count}×
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="expenses-view__progress-track">
                    {hasBudget && (
                      <div className={`expenses-view__progress-budget expenses-view__progress-budget--${mod(category)}`} />
                    )}
                    <div
                      className={`expenses-view__progress-fill expenses-view__progress-fill--${mod(category)}`}
                      style={{ width: `${spentPct}%` }}
                    />
                  </div>
                  {hasBudget ? (
                    <button
                      className={`expenses-view__budget-line${overBudget ? ' expenses-view__budget-line--over' : ''}`}
                      onClick={() => setEditingBudgetCategory(category)}
                      type="button"
                    >
                      <span>
                        {overBudget
                          ? `₪ ${(total - budget).toFixed(2)} over ₪${budget.toFixed(2)} budget`
                          : `₪ ${remaining.toFixed(2)} left of ₪${budget.toFixed(2)}`}
                      </span>
                      <span className="expenses-view__budget-line-pct">
                        · {budgetUsedPct.toFixed(0)}%
                      </span>
                      {inheritedLabel && (
                        <span className="expenses-view__budget-line-inherited">
                          · carried from {inheritedLabel}
                        </span>
                      )}
                    </button>
                  ) : (
                    <button
                      className="expenses-view__budget-line expenses-view__budget-line--empty"
                      onClick={() => setEditingBudgetCategory(category)}
                      type="button"
                    >
                      + Set monthly budget
                    </button>
                  )}
                </div>
              )
            })}
            <div className="expenses-view__category-summary">
              {categoryBreakdown.length} categor{categoryBreakdown.length === 1 ? 'y' : 'ies'} {isCurrentMonth ? 'this month' : `in ${monthName}`}
            </div>
          </div>
        )}
      </div>

      {editingBudgetCategory && (() => {
        const entry = budgetByCategory[editingBudgetCategory]
        const isInherited = entry?.inheritedFromMonth != null
        return (
          <BudgetEditModal
            category={editingBudgetCategory}
            currentAmount={entry?.amount ?? 0}
            inheritedFromMonth={entry?.inheritedFromMonth ?? null}
            currentMonthLabel={monthName}
            existingBudgetId={entry?.id ?? null}
            onSave={(amount, mode) => {
              const payload = { category: editingBudgetCategory, month: monthKey, amount }
              const onSuccess = () => showToast({ message: `Budget saved for ${editingBudgetCategory}`, variant: 'info' })
              const onError = () => showToast({ message: 'Failed to save budget', variant: 'error' })
              if (mode === 'from-now-on') {
                changeBudgetFromNow.mutate(payload, { onSuccess, onError })
              } else {
                upsertBudget.mutate(payload, { onSuccess, onError })
              }
              setEditingBudgetCategory(null)
            }}
            onRemove={(mode) => {
              const onSuccess = () => showToast({ message: `Budget removed for ${editingBudgetCategory}`, variant: 'info' })
              const onError = () => showToast({ message: 'Failed to remove budget', variant: 'error' })
              if (mode === 'entirely') {
                removeBudgetEntirely.mutate(
                  { category: editingBudgetCategory, month: monthKey },
                  { onSuccess, onError }
                )
              } else if (isInherited) {
                // "Remove for this month only" on an inherited budget → write a 0 override.
                upsertBudget.mutate(
                  { category: editingBudgetCategory, month: monthKey, amount: 0 },
                  { onSuccess, onError }
                )
              } else if (entry?.id !== undefined) {
                // Locally-set budget → just delete the row.
                deleteBudget.mutate(entry.id, { onSuccess, onError })
              }
              setEditingBudgetCategory(null)
            }}
            onCancel={() => setEditingBudgetCategory(null)}
          />
        )
      })()}

      {showBulkBudgetModal && (
        <BudgetsBulkModal
          currentMonthLabel={monthName}
          entries={bulkBudgetEntries}
          onSave={handleBulkBudgetSave}
          onCancel={() => setShowBulkBudgetModal(false)}
        />
      )}
    </div>
  )
}

export default ExpensesView
