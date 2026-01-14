import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExpensesByDateRange, useDeleteExpense, useGenerateRecurringExpenses } from '@/hooks';
import type { Expense } from '@/types';

// Category icons mapping
const CATEGORY_ICONS: Record<string, string> = {
  'Food': '🍴',
  'Groceries': '🛒',
  'Transport': '🚌',
  'Shopping': '🛍️',
  'Bills': '📄',
  'Entertainment': '🎮',
  'Health': '💊',
  'Other': '📦',
};

// Category border colors (matching ExpenseQuickAdd)
const CATEGORY_COLORS: Record<string, string> = {
  'Food': 'border-l-orange-500',
  'Groceries': 'border-l-blue-500',
  'Transport': 'border-l-amber-500',
  'Shopping': 'border-l-pink-500',
  'Bills': 'border-l-slate-500',
  'Entertainment': 'border-l-purple-500',
  'Health': 'border-l-emerald-500',
  'Other': 'border-l-gray-500',
};

// Category background colors for category view
const CATEGORY_BG_COLORS: Record<string, string> = {
  'Food': 'bg-orange-500',
  'Groceries': 'bg-blue-500',
  'Transport': 'bg-amber-500',
  'Shopping': 'bg-pink-500',
  'Bills': 'bg-slate-500',
  'Entertainment': 'bg-purple-500',
  'Health': 'bg-emerald-500',
  'Other': 'bg-gray-500',
};

type ViewMode = 'timeline' | 'category';

export function ExpensesView() {
  const navigate = useNavigate();
  const deleteExpense = useDeleteExpense();
  const generateRecurring = useGenerateRecurringExpenses();
  
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');

  // Generate recurring expenses on mount
  useEffect(() => {
    generateRecurring.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get first day of current month and last day of current month
  const { startDate, endDate, monthName } = useMemo(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      startDate: firstDay.toISOString().split('T')[0],
      endDate: lastDay.toISOString().split('T')[0],
      monthName: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }, []);

  const { data: expenses = [], isLoading } = useExpensesByDateRange(startDate, endDate);

  // Group expenses by date for timeline view
  const groupedExpenses = useMemo(() => {
    const groups: Record<string, Expense[]> = {};
    
    expenses.forEach((expense) => {
      const date = new Date(expense.createdAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(expense);
    });

    return Object.entries(groups).sort((a, b) => {
      const dateA = new Date(expenses.find(e => 
        new Date(e.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) === a[0]
      )?.createdAt || 0);
      const dateB = new Date(expenses.find(e => 
        new Date(e.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) === b[0]
      )?.createdAt || 0);
      return dateB.getTime() - dateA.getTime();
    });
  }, [expenses]);

  // Group expenses by category for category view
  const categoryBreakdown = useMemo(() => {
    const categories: Record<string, { total: number; count: number }> = {};
    
    expenses.forEach((expense) => {
      if (!categories[expense.category]) {
        categories[expense.category] = { total: 0, count: 0 };
      }
      categories[expense.category].total += expense.amount;
      categories[expense.category].count += 1;
    });

    // Sort by total amount descending
    return Object.entries(categories)
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  // Calculate total
  const totalSpent = useMemo(() => {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation(); // Prevent navigation when deleting
    if (confirm('Delete this expense?')) {
      deleteExpense.mutate(id);
    }
  };

  const handleExpenseClick = (id: number) => {
    navigate(`/expense/edit/${id}`);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="min-h-screen bg-surface-900 pb-24">
      {/* Summary Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-6">
        <p className="text-emerald-200 text-sm">{monthName}</p>
        <p className="text-3xl font-bold text-white mt-1">
          ₪ {totalSpent.toFixed(2)}
        </p>
        <p className="text-emerald-200 text-sm mt-1">
          {expenses.length} expense{expenses.length !== 1 ? 's' : ''} this month
        </p>
      </div>

      {/* View Toggle & Add Button */}
      <div className="px-4 py-3 border-b border-surface-700 flex gap-3">
        {/* View Mode Toggle */}
        <div className="flex bg-surface-700 rounded-xl p-1">
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'timeline'
                ? 'bg-surface-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Timeline
          </button>
          <button
            onClick={() => setViewMode('category')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'category'
                ? 'bg-surface-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            By Category
          </button>
        </div>

        {/* Add Expense Button */}
        <button
          onClick={() => navigate('/expense/add')}
          className="flex-1 bg-surface-700 hover:bg-surface-600 text-gray-200 py-2 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <span className="text-xl">+</span>
          <span>Add</span>
        </button>
      </div>

      {/* Content */}
      <div className="px-4">
        {isLoading ? (
          <div className="py-12 text-center text-gray-500">Loading...</div>
        ) : expenses.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-500 mb-2">No expenses this month</p>
            <p className="text-gray-600 text-sm">Tap + to add your first expense</p>
          </div>
        ) : viewMode === 'timeline' ? (
          // Timeline View
          groupedExpenses.map(([date, dayExpenses]) => (
            <div key={date} className="py-3">
              {/* Date Header */}
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                {date}
              </p>

              {/* Day's Expenses */}
              <div className="space-y-2">
                {dayExpenses.map((expense) => (
                  <div
                    key={expense.id}
                    onClick={() => handleExpenseClick(expense.id)}
                    className={`bg-surface-800 rounded-xl p-3 flex items-center gap-3 border-l-4 cursor-pointer hover:bg-surface-750 transition-colors ${CATEGORY_COLORS[expense.category] || 'border-l-gray-500'}`}
                  >
                    {/* Category Icon */}
                    <div className="w-10 h-10 bg-surface-700 rounded-full flex items-center justify-center text-xl">
                      {CATEGORY_ICONS[expense.category] || '📦'}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-200 font-medium">{expense.category}</p>
                      {expense.note && (
                        <p className="text-gray-500 text-sm truncate">{expense.note}</p>
                      )}
                      <p className="text-gray-600 text-xs">{formatTime(expense.createdAt)}</p>
                    </div>

                    {/* Amount */}
                    <div className="text-right">
                      <p className="text-gray-100 font-semibold">₪ {expense.amount.toFixed(2)}</p>
                    </div>

                    {/* Delete Button */}
                    <button
                      onClick={(e) => handleDelete(e, expense.id)}
                      className="p-2 text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          // Category View
          <div className="py-4 space-y-3">
            {categoryBreakdown.map(({ category, total, count }) => {
              const percentage = totalSpent > 0 ? (total / totalSpent) * 100 : 0;
              return (
                <div
                  key={category}
                  className="bg-surface-800 rounded-xl p-4"
                >
                  <div className="flex items-center gap-3 mb-3">
                    {/* Category Icon */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${CATEGORY_BG_COLORS[category] || 'bg-gray-500'}`}>
                      {CATEGORY_ICONS[category] || '📦'}
                    </div>

                    {/* Category Info */}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-gray-200 font-semibold">{category}</p>
                        <p className="text-gray-100 font-bold">₪ {total.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-gray-500 text-sm">
                          {count} expense{count !== 1 ? 's' : ''}
                        </p>
                        <p className="text-gray-400 text-sm">
                          {percentage.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-2 bg-surface-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${CATEGORY_BG_COLORS[category] || 'bg-gray-500'}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Category Summary */}
            <div className="mt-6 pt-4 border-t border-surface-700">
              <p className="text-gray-500 text-sm text-center">
                {categoryBreakdown.length} categories with expenses this month
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
