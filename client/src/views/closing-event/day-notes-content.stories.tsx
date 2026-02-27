import type { Meta, StoryObj } from '@storybook/react-vite'
import DayNotesContent from './day-notes-content'
import type { WorkLog } from '@/types'

const makeLog = (overrides: Partial<WorkLog> = {}): WorkLog => ({
  id: 1,
  logDate: '2026-02-27',
  integrityScore: 1,
  successNote: null,
  missedOpportunityNote: null,
  createdAt: '2026-02-27',
  ...overrides,
})

const meta = {
  title: 'DayNotesContent',
  component: DayNotesContent,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DayNotesContent>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    log: makeLog({
      successNote: 'Completed all planned deep work blocks and shipped the feature on time.',
      missedOpportunityNote: 'Could have delegated the code review instead of doing it myself.',
    }),
  },
}

export const SuccessOnly: Story = {
  args: {
    log: makeLog({
      successNote: 'Stayed focused for 4 hours straight on the architecture redesign.',
    }),
  },
}

export const MissedOnly: Story = {
  args: {
    log: makeLog({
      integrityScore: 0,
      missedOpportunityNote: 'Spent too much time scrolling instead of preparing for the presentation.',
    }),
  },
}

export const NoNotes: Story = {
  args: {
    log: makeLog(),
  },
}
