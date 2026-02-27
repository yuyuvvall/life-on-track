import './spending-chart.less'

export type SpendingChartProps = {
  expensesByCategory: Record<string, number>
  totalExpenses: number
}

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#f59e0b',
  Transport: '#3b82f6',
  Entertainment: '#a855f7',
  Shopping: '#ec4899',
  Bills: '#ef4444',
  Health: '#22c55e',
  Other: '#6b7280',
}

const SpendingChart = ({ expensesByCategory, totalExpenses }: SpendingChartProps) => {
  const categories = Object.entries(expensesByCategory)
    .sort(([, a], [, b]) => b - a)

  if (categories.length === 0) {
    return (
      <div className="spending-chart">
        <h3 className="spending-chart__title">Spending</h3>
        <div className="spending-chart__empty">
          No expenses this week
        </div>
      </div>
    )
  }

  const maxAmount = Math.max(...categories.map(([, amount]) => amount))

  return (
    <div className="spending-chart">
      <div className="spending-chart__header">
        <h3 className="spending-chart__title">Spending</h3>
        <span className="spending-chart__total">
          ${totalExpenses.toFixed(2)}
        </span>
      </div>

      <div className="spending-chart__categories">
        {categories.map(([category, amount]) => {
          const percentage = (amount / maxAmount) * 100
          const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other

          return (
            <div key={category}>
              <div className="spending-chart__category-label">
                <span className="spending-chart__category-name">{category}</span>
                <span className="spending-chart__category-amount">${amount.toFixed(2)}</span>
              </div>
              <div className="spending-chart__bar-track">
                <div
                  className="spending-chart__bar-fill"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SpendingChart
