import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import GoalsProgress from './goals-progress'
import type { Goal } from '@/types'

const makeGoal = (overrides: Partial<Goal> & { id: string; title: string }): Goal => ({
  parentId: null,
  goalType: 'frequency',
  targetValue: 10,
  unit: 'times',
  currentValue: 0,
  totalPages: null,
  currentPage: 0,
  frequencyPeriod: 'weekly',
  startDate: '2026-01-01',
  targetDate: '2026-06-01',
  isActive: true,
  createdAt: '2026-01-01',
  ...overrides,
})

const defaultProps = {
  goals: [] as Goal[],
  expandedGoalId: null,
  expandedGoalLogs: [],
  isLogsLoading: false,
  isLogging: false,
  onGoalToggle: vi.fn(),
  onQuickLog: vi.fn(),
}

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

describe('GoalsProgress', () => {
  it('shows empty state when no goals', () => {
    renderWithRouter(<GoalsProgress {...defaultProps} />)
    expect(screen.getByText('No goals set')).toBeInTheDocument()
    expect(screen.getByText('Add Goals')).toBeInTheDocument()
  })

  it('renders goal titles', () => {
    const goals = [
      makeGoal({ id: 'g1', title: 'Exercise weekly' }),
      makeGoal({ id: 'g2', title: 'Read more books', goalType: 'reading', totalPages: 300, currentPage: 100 }),
    ]
    renderWithRouter(<GoalsProgress {...defaultProps} goals={goals} />)
    expect(screen.getByText('Exercise weekly')).toBeInTheDocument()
    expect(screen.getByText('Read more books')).toBeInTheDocument()
  })

  it('shows max 4 goals with overflow link', () => {
    const goals = Array.from({ length: 6 }, (_, i) =>
      makeGoal({ id: `g${i}`, title: `Goal ${i + 1}` })
    )
    renderWithRouter(<GoalsProgress {...defaultProps} goals={goals} />)
    expect(screen.getByText('+2 more goals')).toBeInTheDocument()
  })

  it('calls onQuickLog when + button is clicked on frequency goal', async () => {
    const onQuickLog = vi.fn()
    const goals = [makeGoal({ id: 'g1', title: 'Exercise', goalType: 'frequency', targetValue: 5, currentValue: 2 })]
    renderWithRouter(<GoalsProgress {...defaultProps} goals={goals} onQuickLog={onQuickLog} />)

    await userEvent.click(screen.getByTitle('Quick log'))
    expect(onQuickLog).toHaveBeenCalledWith(goals[0])
  })

  it('calls onGoalToggle when accordion button is clicked', async () => {
    const onGoalToggle = vi.fn()
    const goals = [makeGoal({ id: 'g1', title: 'Exercise' })]
    renderWithRouter(<GoalsProgress {...defaultProps} goals={goals} onGoalToggle={onGoalToggle} />)

    await userEvent.click(screen.getByTitle('Show logs'))
    expect(onGoalToggle).toHaveBeenCalledWith('g1')
  })
})
