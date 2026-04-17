import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import IntegrityHeatmap from './integrity-heatmap'
import type { WorkLog } from '@/types'

const WEEK_START = '2026-02-22'

const makeLog = (date: string, score: 0 | 1): WorkLog => ({
  id: Math.random() * 1000 | 0,
  logDate: date,
  integrityScore: score,
  successNote: null,
  missedOpportunityNote: null,
  createdAt: date,
})

describe('IntegrityHeatmap', () => {
  it('renders 7 day cells', () => {
    render(<IntegrityHeatmap workLogs={[]} weekStart={WEEK_START} />)
    const cells = screen.getAllByTitle(/2026-02-2/)
    expect(cells.length).toBe(7)
  })

  it('renders day name labels', () => {
    render(<IntegrityHeatmap workLogs={[]} weekStart={WEEK_START} />)
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('Sat')).toBeInTheDocument()
  })

  it('shows success count and fail count in the header', () => {
    const logs = [
      makeLog('2026-02-22', 1),
      makeLog('2026-02-23', 1),
      makeLog('2026-02-24', 0),
    ]
    const { container } = render(<IntegrityHeatmap workLogs={logs} weekStart={WEEK_START} />)
    const greenSpan = container.querySelector('.text-accent-green')!
    const redSpan = container.querySelector('.text-accent-red')!
    expect(greenSpan.textContent).toContain('2')
    expect(redSpan.textContent).toContain('1')
  })

  it('calls onDayClick when a logged day is clicked', async () => {
    const onDayClick = vi.fn()
    const logs = [makeLog('2026-02-22', 1)]
    render(<IntegrityHeatmap workLogs={logs} weekStart={WEEK_START} onDayClick={onDayClick} />)

    const cell = screen.getByTitle(/2026-02-22: Success/)
    await userEvent.click(cell)
    expect(onDayClick).toHaveBeenCalledWith(logs[0], '2026-02-22')
  })

  it('does not call onDayClick for unlogged days', async () => {
    const onDayClick = vi.fn()
    render(<IntegrityHeatmap workLogs={[]} weekStart={WEEK_START} onDayClick={onDayClick} />)

    const cell = screen.getByTitle(/2026-02-22: No log/)
    await userEvent.click(cell)
    expect(onDayClick).not.toHaveBeenCalled()
  })
})
