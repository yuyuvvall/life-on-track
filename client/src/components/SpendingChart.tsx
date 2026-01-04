interface SpendingChartProps {
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#f59e0b',
  Transport: '#3b82f6',
  Entertainment: '#a855f7',
  Shopping: '#ec4899',
  Bills: '#ef4444',
  Health: '#22c55e',
  Other: '#6b7280',
};

export function SpendingChart({ expensesByCategory, totalExpenses }: SpendingChartProps) {
  const categories = Object.entries(expensesByCategory)
    .sort(([, a], [, b]) => b - a);

  if (categories.length === 0) {
    return (
      <div className="bg-surface-700 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Spending</h3>
        <div className="text-center py-4 text-gray-500 text-sm">
          No expenses this week
        </div>
      </div>
    );
  }

  const maxAmount = Math.max(...categories.map(([, amount]) => amount));

  return (
    <div className="bg-surface-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-300">Spending</h3>
        <span className="font-mono text-sm text-gray-100">
          ${totalExpenses.toFixed(2)}
        </span>
      </div>

      <div className="space-y-2">
        {categories.map(([category, amount]) => {
          const percentage = (amount / maxAmount) * 100;
          const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
          
          return (
            <div key={category}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-400">{category}</span>
                <span className="font-mono text-gray-300">${amount.toFixed(2)}</span>
              </div>
              <div className="h-2 bg-surface-500 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all"
                  style={{ 
                    width: `${percentage}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

