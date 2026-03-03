import { GoalCard } from '@/components/goal-card'
import type { Goal } from '@/types'
import './goal-section.less'

export type GoalSectionProps = {
  title: string
  icon: string
  goals: Goal[]
  onDelete: (id: string) => void
}

const GoalSection = ({ title, icon, goals, onDelete }: GoalSectionProps) => {
  return (
    <section className="goal-section">
      <h2 className="goal-section__title">
        <span>{icon}</span>
        {title}
        <span className="goal-section__count">({goals.length})</span>
      </h2>
      <div className="goal-section__list">
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} onDelete={onDelete} />
        ))}
      </div>
    </section>
  )
}

export default GoalSection
