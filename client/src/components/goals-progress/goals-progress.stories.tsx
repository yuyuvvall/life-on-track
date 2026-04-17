import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { MemoryRouter } from 'react-router-dom'
import GoalsProgress from './goals-progress'
import type { Goal, GoalLog } from '@/types'

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

const sampleGoals: Goal[] = [
  makeGoal({ id: 'g1', title: 'Exercise 4x per week', targetValue: 4, currentValue: 2, goalType: 'frequency' }),
  makeGoal({ id: 'g2', title: 'Read "Atomic Habits"', goalType: 'reading', targetValue: 1, currentValue: 0, totalPages: 320, currentPage: 185 }),
  makeGoal({ id: 'g3', title: 'Save $5000 emergency fund', goalType: 'numeric', targetValue: 5000, currentValue: 3200, unit: 'dollars' }),
  makeGoal({ id: 'g4', title: 'Meditate daily', targetValue: 7, currentValue: 5, goalType: 'frequency' }),
]

const sampleLogs: GoalLog[] = [
  { id: 1, goalId: 'g1', logDate: '2026-02-25', value: 1, note: 'Morning run', createdAt: '2026-02-25' },
  { id: 2, goalId: 'g1', logDate: '2026-02-23', value: 1, note: 'Gym session', createdAt: '2026-02-23' },
  { id: 3, goalId: 'g1', logDate: '2026-02-21', value: 1, note: null, createdAt: '2026-02-21' },
]

const meta = {
  title: 'GoalsProgress',
  component: GoalsProgress,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
  args: {
    onGoalToggle: fn(),
    onQuickLog: fn(),
    expandedGoalId: null,
    expandedGoalLogs: [],
    isLogsLoading: false,
    isLogging: false,
  },
} satisfies Meta<typeof GoalsProgress>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    goals: sampleGoals,
  },
}

export const NoGoals: Story = {
  args: {
    goals: [],
  },
}

export const AllComplete: Story = {
  args: {
    goals: [
      makeGoal({ id: 'g1', title: 'Exercise 4x per week', targetValue: 4, currentValue: 4, goalType: 'frequency' }),
      makeGoal({ id: 'g2', title: 'Read "Atomic Habits"', goalType: 'reading', targetValue: 1, currentValue: 1, totalPages: 320, currentPage: 320 }),
      makeGoal({ id: 'g3', title: 'Save $5000 emergency fund', goalType: 'numeric', targetValue: 5000, currentValue: 5200, unit: 'dollars' }),
    ],
  },
}

export const ManyGoals: Story = {
  args: {
    goals: [
      ...sampleGoals,
      makeGoal({ id: 'g5', title: 'Learn TypeScript patterns', targetValue: 20, currentValue: 8 }),
      makeGoal({ id: 'g6', title: 'Practice guitar', targetValue: 14, currentValue: 3 }),
    ],
  },
}

export const WithExpandedLogs: Story = {
  args: {
    goals: sampleGoals,
    expandedGoalId: 'g1',
    expandedGoalLogs: sampleLogs,
  },
}
