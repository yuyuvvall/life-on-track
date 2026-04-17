import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import IntegrityHeatmap from './integrity-heatmap'
import type { WorkLog } from '@/types'

const makeLog = (date: string, score: 0 | 1 | null, successNote?: string, missedNote?: string): WorkLog => ({
  id: Math.random() * 1000 | 0,
  logDate: date,
  integrityScore: score,
  successNote: successNote || null,
  missedOpportunityNote: missedNote || null,
  createdAt: date,
})

const WEEK_START = '2026-02-22'

const meta = {
  title: 'IntegrityHeatmap',
  component: IntegrityHeatmap,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: {
    onDayClick: fn(),
    weekStart: WEEK_START,
  },
} satisfies Meta<typeof IntegrityHeatmap>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    workLogs: [
      makeLog('2026-02-22', 1, 'Completed morning routine'),
      makeLog('2026-02-23', 1),
      makeLog('2026-02-24', 0, undefined, 'Skipped gym session'),
      makeLog('2026-02-25', 1, 'Deep work block went great'),
      makeLog('2026-02-26', 0, undefined, 'Got distracted by social media'),
      makeLog('2026-02-27', 1),
    ],
  },
}

export const AllSuccess: Story = {
  args: {
    workLogs: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(WEEK_START)
      d.setDate(d.getDate() + i)
      return makeLog(d.toISOString().split('T')[0], 1, 'Stayed on track')
    }),
  },
}

export const AllMissed: Story = {
  args: {
    workLogs: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(WEEK_START)
      d.setDate(d.getDate() + i)
      return makeLog(d.toISOString().split('T')[0], 0, undefined, 'Rough day')
    }),
  },
}

export const EmptyWeek: Story = {
  args: {
    workLogs: [],
  },
}

export const WithNotes: Story = {
  args: {
    workLogs: [
      makeLog('2026-02-22', 1, 'Had a productive coding session', 'Could have taken more breaks'),
      makeLog('2026-02-23', 0, undefined, 'Missed deadline on project review'),
      makeLog('2026-02-24', 1, 'Good meal prep for the week'),
    ],
  },
}
