import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
import TagManageModal from '@/components/tag-manage-modal'
import CategoryManageModal from '@/components/category-manage-modal/category-manage-modal'
import { useTags } from '@/hooks/useTags'
import { useCategories } from '@/hooks/useCategories'
import { formatCurrency } from '@/utils/currency'
import type { Category, Expense, Tag } from '@/types'
import './expenses-view.less'

const FALLBACK_ICON = '📦'
const UNTAGGED_COLOR = '#6b7280'
const UNTAGGED_ICON = '—'

type ViewMode = 'category' | 'timeline' | 'tag'

type TagFilter = number | 'none' | null

type SelectedMonth = { year: number; month: number }

const shiftMonth = ({ year, month }: SelectedMonth, delta: number): SelectedMonth => {
  const next = new Date(year, month + delta, 1)
  return { year: next.getFullYear(), month: next.getMonth() }
}

const ExpensesView = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const deleteExpense = useDeleteExpense()
  const createExpense = useCreateExpense()
  const generateRecurring = useGenerateRecurringExpenses()

  const categoryFilterParam = searchParams.get('category')
  const categoryFilter: number | null = useMemo(() => {
    const n = Number(categoryFilterParam)
    return Number.isInteger(n) && n > 0 ? n : null
  }, [categoryFilterParam])

  const tagFilterParam = searchParams.get('tag')
  const tagFilter: TagFilter = useMemo(() => {
    if (tagFilterParam === 'none') return 'none'
    const n = Number(tagFilterParam)
    return Number.isInteger(n) && n > 0 ? n : null
  }, [tagFilterParam])

  // Default to "By Category" — drill into a card to switch to the filtered timeline.
  const [viewMode, setViewMode] = useState<ViewMode>('category')
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
  const { data: allCategories = [] } = useCategories(true)
  const tagsById = useMemo(() => {
    const map = new Map<number, Tag>()
    for (const t of allTags) map.set(t.id, t)
    return map
  }, [allTags])
  const categoriesByName = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of allCategories) map.set(c.name.toLowerCase(), c)
    return map
  }, [allCategories])
  const lookupCategory = (name: string): Category | undefined => categoriesByName.get(name.toLowerCase())
  const categoriesById = useMemo(() => {
    const map = new Map<number, Category>()
    for (const c of allCategories) map.set(c.id, c)
    return map
  }, [allCategories])
  const filteredCategory: Category | null = categoryFilter !== null ? (categoriesById.get(categoryFilter) ?? null) : null
  // Once category data loads, drop a stale category filter (id no longer exists).
  useEffect(() => {
    if (categoryFilter === null) return
    if (allCategories.length === 0) return
    if (!categoriesById.has(categoryFilter)) {
      const next = new URLSearchParams(searchParams)
      next.delete('category')
      setSearchParams(next, { replace: true })
    }
  }, [categoryFilter, allCategories.length, categoriesById, searchParams, setSearchParams])

  // Resolved display for whichever tag-shaped thing is in the filter (real Tag,
  // synthetic "Untagged", or none).
  const filteredTagDisplay: { name: string; icon: string; color: string } | null = useMemo(() => {
    if (tagFilter === 'none') return { name: 'Untagged', icon: UNTAGGED_ICON, color: UNTAGGED_COLOR }
    if (typeof tagFilter === 'number') {
      const t = tagsById.get(tagFilter)
      return t ? { name: t.name, icon: t.icon, color: t.color } : null
    }
    return null
  }, [tagFilter, tagsById])

  // Drop a stale tag filter once tags load (the id no longer exists).
  useEffect(() => {
    if (typeof tagFilter !== 'number') return
    if (allTags.length === 0) return
    if (!tagsById.has(tagFilter)) {
      const next = new URLSearchParams(searchParams)
      next.delete('tag')
      setSearchParams(next, { replace: true })
    }
  }, [tagFilter, allTags.length, tagsById, searchParams, setSearchParams])

  // Mutual exclusion: setting one filter always clears the other so the
  // breakdowns never compose into a confusing AND state.
  const handleSelectCategoryFilter = (id: number) => {
    const next = new URLSearchParams(searchParams)
    next.set('category', String(id))
    next.delete('tag')
    setSearchParams(next)
    setViewMode('timeline')
  }
  const handleClearCategoryFilter = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('category')
    setSearchParams(next)
  }
  const handleSelectTagFilter = (id: number | 'none') => {
    const next = new URLSearchParams(searchParams)
    next.set('tag', id === 'none' ? 'none' : String(id))
    next.delete('category')
    setSearchParams(next)
    setViewMode('timeline')
  }
  const handleClearTagFilter = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('tag')
    setSearchParams(next)
  }
  const handleClearAllFilters = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('category')
    next.delete('tag')
    setSearchParams(next)
  }
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
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)

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

  const timelineExpenses = useMemo(() => {
    let out = expenses
    if (categoryFilter !== null) out = out.filter((e) => e.categoryId === categoryFilter)
    if (tagFilter === 'none') out = out.filter((e) => e.tagId === null)
    else if (typeof tagFilter === 'number') out = out.filter((e) => e.tagId === tagFilter)
    return out
  }, [expenses, categoryFilter, tagFilter])

  const groupedExpenses = useMemo(() => {
    const groups: Record<string, Expense[]> = {}

    timelineExpenses.forEach((expense) => {
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
      const dateA = new Date(timelineExpenses.find(e =>
        new Date(e.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) === a[0]
      )?.createdAt || 0)
      const dateB = new Date(timelineExpenses.find(e =>
        new Date(e.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) === b[0]
      )?.createdAt || 0)
      return dateB.getTime() - dateA.getTime()
    })
  }, [timelineExpenses])

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

  // Flat per-tag breakdown for the By Tag tab. Untagged expenses collapse into
  // a single sentinel row appended at the end so % share-of-wallet adds to 100.
  const tagBreakdown = useMemo(() => {
    const accum = new Map<number, { total: number; count: number }>()
    let untaggedTotal = 0
    let untaggedCount = 0
    for (const e of expenses) {
      if (e.tagId === null) {
        untaggedTotal += e.amount
        untaggedCount += 1
        continue
      }
      const prev = accum.get(e.tagId) ?? { total: 0, count: 0 }
      accum.set(e.tagId, { total: prev.total + e.amount, count: prev.count + 1 })
    }
    const rows: Array<{ tag: Tag | null; total: number; count: number }> = []
    for (const [tagId, stats] of accum) {
      const tag = tagsById.get(tagId)
      if (!tag) continue
      rows.push({ tag, total: stats.total, count: stats.count })
    }
    rows.sort((a, b) => b.total - a.total)
    if (untaggedCount > 0) {
      rows.push({ tag: null, total: untaggedTotal, count: untaggedCount })
    }
    return rows
  }, [expenses, tagsById])

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
      message: `Deleted ${formatCurrency(expense.amount)} ${expense.category}`,
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
        <p className="expenses-view__summary-total">{formatCurrency(totalSpent, { space: true })}</p>
        <p className="expenses-view__summary-count">
          {expenses.length} expense{expenses.length !== 1 ? 's' : ''} {isCurrentMonth ? 'this month' : `in ${monthName}`}
        </p>
      </div>

      <div className="expenses-view__controls">
        <div className="expenses-view__toggle">
          <button
            onClick={() => { handleClearAllFilters(); setViewMode('category'); }}
            className={`expenses-view__toggle-btn${viewMode === 'category' ? ' expenses-view__toggle-btn--active' : ''}`}
          >
            By Category
          </button>
          <button
            onClick={() => { handleClearAllFilters(); setViewMode('timeline'); }}
            className={`expenses-view__toggle-btn${viewMode === 'timeline' ? ' expenses-view__toggle-btn--active' : ''}`}
          >
            Timeline
          </button>
          <button
            onClick={() => { handleClearAllFilters(); setViewMode('tag'); }}
            className={`expenses-view__toggle-btn${viewMode === 'tag' ? ' expenses-view__toggle-btn--active' : ''}`}
          >
            By Tag
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

      {viewMode === 'timeline' && (filteredCategory || filteredTagDisplay) && (
        <div className="expenses-view__filter-chip-row">
          {filteredCategory && (
            <button
              type="button"
              className="expenses-view__filter-chip"
              onClick={handleClearCategoryFilter}
              style={{ borderColor: filteredCategory.color }}
            >
              <span
                className="expenses-view__filter-chip-icon"
                style={{ backgroundColor: filteredCategory.color }}
              >
                {filteredCategory.icon}
              </span>
              <span className="expenses-view__filter-chip-name">{filteredCategory.name}</span>
              <span className="expenses-view__filter-chip-close" aria-hidden>×</span>
            </button>
          )}
          {filteredTagDisplay && (
            <button
              type="button"
              className="expenses-view__filter-chip"
              onClick={handleClearTagFilter}
              style={{ borderColor: filteredTagDisplay.color }}
            >
              <span
                className="expenses-view__filter-chip-icon"
                style={{ backgroundColor: filteredTagDisplay.color }}
              >
                {filteredTagDisplay.icon}
              </span>
              <span className="expenses-view__filter-chip-name">{filteredTagDisplay.name}</span>
              <span className="expenses-view__filter-chip-close" aria-hidden>×</span>
            </button>
          )}
        </div>
      )}

      <TagChipRow mode="quick-add" isCurrentMonth={isCurrentMonth} />

      <div className="expenses-view__content">
        {isLoading ? (
          <div className="expenses-view__loading">Loading...</div>
        ) : expenses.length === 0 && viewMode === 'timeline' ? (
          <div className="expenses-view__empty">
            <p className="expenses-view__empty-title">
              No expenses {isCurrentMonth ? 'this month' : `in ${monthName}`}
            </p>
            <p className="expenses-view__empty-subtitle">
              {isCurrentMonth ? 'Tap + to add your first expense' : 'Nothing was logged for this month'}
            </p>
          </div>
        ) : viewMode === 'timeline' ? (
          groupedExpenses.length === 0 ? (
            <div className="expenses-view__empty">
              <p className="expenses-view__empty-title">
                {filteredCategory ? `No ${filteredCategory.name} expenses` : filteredTagDisplay ? `No ${filteredTagDisplay.name} expenses` : 'No expenses'}
                {' '}{isCurrentMonth ? 'this month' : `in ${monthName}`}
              </p>
            </div>
          ) :
          groupedExpenses.map(([date, dayExpenses]) => (
            <div key={date} className="expenses-view__date-group">
              <p className="expenses-view__date-header">{date}</p>
              <div className="expenses-view__day-expenses">
                {dayExpenses.map((expense) => {
                  const expenseCat = lookupCategory(expense.category)
                  return (
                  <div
                    key={expense.id}
                    onClick={() => handleExpenseClick(expense.id)}
                    className="expenses-view__expense-card"
                    style={{ ['--cat-color' as string]: expenseCat?.color ?? '#6b7280' }}
                  >
                    <div className="expenses-view__expense-icon">
                      {expenseCat?.icon ?? FALLBACK_ICON}
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
                      <p>{formatCurrency(expense.amount, { space: true })}</p>
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
                  )
                })}
              </div>
            </div>
          ))
        ) : viewMode === 'category' ? (
          <div className="expenses-view__categories">
            <div className="expenses-view__categories-header">
              <span className="expenses-view__categories-title">
                {categoryBreakdown.length > 0 ? 'Categories' : `No spend or budgets ${isCurrentMonth ? 'this month' : `in ${monthName}`}`}
              </span>
              <div className="expenses-view__categories-header-actions">
                <button
                  className="expenses-view__manage-categories-btn"
                  onClick={() => setShowCategoryManager(true)}
                  type="button"
                  aria-label="Manage categories"
                  title="Manage categories"
                >
                  ⚙
                </button>
                <button
                  className="expenses-view__edit-budgets-btn"
                  onClick={() => setShowBulkBudgetModal(true)}
                  type="button"
                >
                  Edit budgets
                </button>
              </div>
            </div>
            {categoryBreakdown.map(({ category, total, count }) => {
              const budgetEntry = budgetByCategory[category]
              const budget = budgetEntry?.amount ?? 0
              const hasBudget = budget > 0
              const overBudget = hasBudget && total > budget
              const remaining = hasBudget ? budget - total : 0
              const shareOfWallet = totalSpent > 0 ? (total / totalSpent) * 100 : 0
              const budgetUsedPct = hasBudget ? (total / budget) * 100 : 0
              // Wallet-share is now the primary bar (always shown, comparable across cards).
              // Budget consumption gets its own track below, only when a budget is set.
              const walletBarPct = shareOfWallet
              const budgetBarPct = hasBudget ? Math.min(100, budgetUsedPct) : 0
              const inheritedFromMonth = budgetEntry?.inheritedFromMonth ?? null
              const inheritedLabel = inheritedFromMonth
                ? new Date(
                    Number(inheritedFromMonth.split('-')[0]),
                    Number(inheritedFromMonth.split('-')[1]) - 1,
                    1
                  ).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                : null

              const cat = lookupCategory(category)
              const catColor = cat?.color ?? '#6b7280'
              return (
                <div
                  key={category}
                  className="expenses-view__category-card"
                  style={{ ['--cat-color' as string]: catColor }}
                >
                  <button
                    type="button"
                    className="expenses-view__category-header"
                    onClick={() => cat && handleSelectCategoryFilter(cat.id)}
                    disabled={!cat}
                    aria-label={`Show only ${category} in timeline`}
                  >
                    <div
                      className="expenses-view__category-icon"
                      data-has-budget={hasBudget ? '' : undefined}
                      style={hasBudget ? { ['--budget-used-pct' as string]: `${budgetBarPct}%` } : undefined}
                      title={hasBudget ? `${budgetUsedPct.toFixed(0)}% of budget used` : undefined}
                    >
                      {hasBudget && <span className="expenses-view__category-icon-fill" aria-hidden="true" />}
                      <span className="expenses-view__category-icon-emoji">{cat?.icon ?? FALLBACK_ICON}</span>
                    </div>
                    <div className="expenses-view__category-info">
                      <div className="expenses-view__category-row">
                        <p className="expenses-view__category-name">{category}</p>
                        <p className="expenses-view__category-amount">{formatCurrency(total, { space: true })}</p>
                      </div>
                      <div className="expenses-view__category-row">
                        <p className="expenses-view__category-count">
                          {count} expense{count !== 1 ? 's' : ''}
                        </p>
                        <p className="expenses-view__category-pct">{shareOfWallet.toFixed(1)}%</p>
                      </div>
                    </div>
                  </button>
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
                            {formatCurrency(total)} · {count}×
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="expenses-view__progress-track">
                    <div
                      className="expenses-view__progress-fill"
                      style={{ width: `${walletBarPct}%` }}
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
                          ? `${formatCurrency(total - budget, { space: true })} over ${formatCurrency(budget)} budget`
                          : `${formatCurrency(remaining, { space: true })} left of ${formatCurrency(budget)}`}
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
        ) : (
          /* By Tag — reuses __category-card / __category-icon / __progress-fill
             via --cat-color set from the tag color. No budget overlay. */
          <div className="expenses-view__categories">
            <div className="expenses-view__categories-header">
              <span className="expenses-view__categories-title">
                {tagBreakdown.length > 0 ? 'Tags' : `No tagged expenses ${isCurrentMonth ? 'this month' : `in ${monthName}`}`}
              </span>
              <div className="expenses-view__categories-header-actions">
                <button
                  className="expenses-view__manage-categories-btn"
                  onClick={() => setShowTagManager(true)}
                  type="button"
                  aria-label="Manage tags"
                  title="Manage tags"
                >
                  ⚙
                </button>
              </div>
            </div>
            {tagBreakdown.map(({ tag, total, count }) => {
              const shareOfWallet = totalSpent > 0 ? (total / totalSpent) * 100 : 0
              const color = tag?.color ?? UNTAGGED_COLOR
              const icon = tag?.icon ?? UNTAGGED_ICON
              const name = tag?.name ?? 'Untagged'
              const filterValue: number | 'none' = tag ? tag.id : 'none'
              const cardKey = tag ? `tag-${tag.id}` : 'tag-none'
              return (
                <div
                  key={cardKey}
                  className="expenses-view__category-card"
                  style={{ ['--cat-color' as string]: color }}
                >
                  <button
                    type="button"
                    className="expenses-view__category-header"
                    onClick={() => handleSelectTagFilter(filterValue)}
                    aria-label={`Show only ${name} in timeline`}
                  >
                    <div className="expenses-view__category-icon">{icon}</div>
                    <div className="expenses-view__category-info">
                      <div className="expenses-view__category-row">
                        <p className="expenses-view__category-name">{name}</p>
                        <p className="expenses-view__category-amount">{formatCurrency(total, { space: true })}</p>
                      </div>
                      <div className="expenses-view__category-row">
                        <p className="expenses-view__category-count">
                          {count} expense{count !== 1 ? 's' : ''}
                        </p>
                        <p className="expenses-view__category-pct">{shareOfWallet.toFixed(1)}%</p>
                      </div>
                    </div>
                  </button>
                  <div className="expenses-view__progress-track">
                    <div
                      className="expenses-view__progress-fill"
                      style={{ width: `${shareOfWallet}%` }}
                    />
                  </div>
                </div>
              )
            })}
            <div className="expenses-view__category-summary">
              {tagBreakdown.length} tag{tagBreakdown.length === 1 ? '' : 's'} {isCurrentMonth ? 'this month' : `in ${monthName}`}
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

      {showCategoryManager && (
        <CategoryManageModal onClose={() => setShowCategoryManager(false)} />
      )}

      {showTagManager && (
        <TagManageModal initialMode="list" onClose={() => setShowTagManager(false)} />
      )}
    </div>
  )
}

export default ExpensesView
