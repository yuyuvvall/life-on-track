import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExpensesByDateRange, useDeleteExpense } from '@/hooks';
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

export function ExpensesView() {
  const navigate = useNavigate();
  const deleteExpense = useDeleteExpense();

  // Get first day of current month and today
  const { startDate, endDate, monthName } = useMemo(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      startDate: firstDay.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
      monthName: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }, []);

  const { data: expenses = [], isLoading } = useExpensesByDateRange(startDate, endDate);

  // Group expenses by date
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

  // Calculate total
  const totalSpent = useMemo(() => {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const handleDelete = (id: number) => {
    if (confirm('Delete this expense?')) {
      deleteExpense.mutate(id);
    }
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

      {/* Add Expense Button */}
      <div className="px-4 py-3 border-b border-surface-700">
        <button
          onClick={() => navigate('/expense/add')}
          className="w-full bg-surface-700 hover:bg-surface-600 text-gray-200 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <span className="text-xl">+</span>
          <span>Add Expense</span>
        </button>
      </div>

      {/* Expenses List */}
      <div className="px-4">
        {isLoading ? (
          <div className="py-12 text-center text-gray-500">Loading...</div>
        ) : expenses.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-500 mb-2">No expenses this month</p>
            <p className="text-gray-600 text-sm">Tap + to add your first expense</p>
          </div>
        ) : (
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
                    className="bg-surface-800 rounded-xl p-3 flex items-center gap-3"
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
                      onClick={() => handleDelete(expense.id)}
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
        )}
      </div>
    </div>
  );
}

