import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExpensesByDateRange, useDeleteExpense, useGenerateRecurringExpenses } from '@/hooks'
import type { Expense } from '@/types'
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

const ExpensesView = () => {
  const navigate = useNavigate()
  const deleteExpense = useDeleteExpense()
  const generateRecurring = useGenerateRecurringExpenses()

  const [viewMode, setViewMode] = useState<ViewMode>('timeline')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generateRecurring.mutate() }, [])

  const { startDate, endDate, monthName } = useMemo(() => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return {
      startDate: firstDay.toISOString().split('T')[0],
      endDate: lastDay.toISOString().split('T')[0],
      monthName: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    }
  }, [])

  const { data: expenses = [], isLoading } = useExpensesByDateRange(startDate, endDate)

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

    return Object.entries(categories)
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.total - a.total)
  }, [expenses])

  const totalSpent = useMemo(() => {
    return expenses.reduce((sum, e) => sum + e.amount, 0)
  }, [expenses])

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (confirm('Delete this expense?')) {
      deleteExpense.mutate(id)
    }
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
        <p className="expenses-view__summary-month">{monthName}</p>
        <p className="expenses-view__summary-total">₪ {totalSpent.toFixed(2)}</p>
        <p className="expenses-view__summary-count">
          {expenses.length} expense{expenses.length !== 1 ? 's' : ''} this month
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
          onClick={() => navigate('/expense/add')}
          className="expenses-view__add-btn"
        >
          <span className="expenses-view__add-icon">+</span>
          <span>Add</span>
        </button>
      </div>

      <div className="expenses-view__content">
        {isLoading ? (
          <div className="expenses-view__loading">Loading...</div>
        ) : expenses.length === 0 ? (
          <div className="expenses-view__empty">
            <p className="expenses-view__empty-title">No expenses this month</p>
            <p className="expenses-view__empty-subtitle">Tap + to add your first expense</p>
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
                      {expense.note && (
                        <p className="expenses-view__expense-note">{expense.note}</p>
                      )}
                      <p className="expenses-view__expense-time">{formatTime(expense.createdAt)}</p>
                    </div>
                    <div className="expenses-view__expense-amount">
                      <p>₪ {expense.amount.toFixed(2)}</p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, expense.id)}
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
            {categoryBreakdown.map(({ category, total, count }) => {
              const percentage = totalSpent > 0 ? (total / totalSpent) * 100 : 0
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
                        <p className="expenses-view__category-pct">{percentage.toFixed(1)}%</p>
                      </div>
                    </div>
                  </div>
                  <div className="expenses-view__progress-track">
                    <div
                      className={`expenses-view__progress-fill expenses-view__progress-fill--${mod(category)}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
            <div className="expenses-view__category-summary">
              {categoryBreakdown.length} categories with expenses this month
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExpensesView
