import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DayNotesContent from './day-notes-content'
import type { WorkLog } from '@/types'

const baseLog: WorkLog = {
  id: 1,
  logDate: '2026-02-27',
  integrityScore: 1,
  successNote: null,
  missedOpportunityNote: null,
  createdAt: '2026-02-27',
}

describe('DayNotesContent', () => {
  it('renders both notes when provided', () => {
    render(
      <DayNotesContent
        log={{
          ...baseLog,
          successNote: 'Great focus today',
          missedOpportunityNote: 'Could have planned better',
        }}
      />
    )
    expect(screen.getByText('Great focus today')).toBeInTheDocument()
    expect(screen.getByText('Could have planned better')).toBeInTheDocument()
  })

  it('shows empty state for missing notes', () => {
    render(<DayNotesContent log={baseLog} />)
    const emptyMessages = screen.getAllByText('No notes recorded')
    expect(emptyMessages).toHaveLength(2)
  })

  it('renders only success note when missed note is null', () => {
    render(
      <DayNotesContent
        log={{ ...baseLog, successNote: 'Finished the sprint' }}
      />
    )
    expect(screen.getByText('Finished the sprint')).toBeInTheDocument()
    expect(screen.getAllByText('No notes recorded')).toHaveLength(1)
  })

  it('renders only missed note when success note is null', () => {
    render(
      <DayNotesContent
        log={{ ...baseLog, missedOpportunityNote: 'Missed the standup' }}
      />
    )
    expect(screen.getByText('Missed the standup')).toBeInTheDocument()
    expect(screen.getAllByText('No notes recorded')).toHaveLength(1)
  })
})
