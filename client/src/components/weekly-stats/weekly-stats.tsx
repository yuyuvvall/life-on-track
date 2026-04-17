import './weekly-stats.less'
import { Link } from 'react-router-dom'
import { useGoals, useWeeklySummary } from '@/hooks'

const WeeklyStats = () => {
  const { data: goals } = useGoals()
  const { data: summary } = useWeeklySummary()

  const stats = [
    ...(goals?.slice(0, 3).map(g => {
      let value = ''
      let percentage = 0

      if (g.goalType === 'reading' && g.totalPages) {
        value = `${g.currentPage}/${g.totalPages}`
        percentage = Math.round((g.currentPage / g.totalPages) * 100)
      } else if (g.goalType === 'frequency') {
        value = `${g.currentValue}/${g.targetValue}`
        percentage = g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0
      } else {
        value = `${g.currentValue}/${g.targetValue}`
        percentage = g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0
      }

      return {
        label: g.title,
        value,
        percentage: Math.min(percentage, 100),
        goalId: g.id,
      }
    }) || []),
    ...(summary ? [{
      label: 'Integrity',
      value: `${summary.integrityRate}%`,
      percentage: summary.integrityRate,
      goalId: null,
    }] : []),
  ]

  if (stats.length === 0) {
    return (
      <div className="weekly-stats">
        <Link to="/goals" className="weekly-stats__card">
          <span className="weekly-stats__add-link">+ Add goals to track</span>
        </Link>
      </div>
    )
  }

  return (
    <div className="weekly-stats">
      {stats.map((stat, i) => (
        <Link
          key={i}
          to={stat.goalId ? `/goals/${stat.goalId}` : '/weekly'}
          className="weekly-stats__card"
        >
          <div className="weekly-stats__label">{stat.label}</div>
          <div className="weekly-stats__value-row">
            <span className="weekly-stats__value">{stat.value}</span>
          </div>
          <div className="weekly-stats__progress-track">
            <div
              className={`weekly-stats__progress-fill ${
                stat.percentage >= 100 ? 'weekly-stats__progress-fill--complete' :
                stat.percentage >= 50 ? 'weekly-stats__progress-fill--mid' :
                'weekly-stats__progress-fill--low'
              }`}
              style={{ width: `${stat.percentage}%` }}
            />
          </div>
        </Link>
      ))}
    </div>
  )
}

export default WeeklyStats
