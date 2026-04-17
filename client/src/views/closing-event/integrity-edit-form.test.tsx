import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import IntegrityEditForm from './integrity-edit-form'

const defaultProps = {
  score: 1 as const,
  successNote: '',
  missedNote: '',
  isPending: false,
  onScoreChange: vi.fn(),
  onSuccessNoteChange: vi.fn(),
  onMissedNoteChange: vi.fn(),
  onSave: vi.fn(),
  onCancel: vi.fn(),
}

describe('IntegrityEditForm', () => {
  it('renders score buttons and textareas', () => {
    render(<IntegrityEditForm {...defaultProps} />)
    expect(screen.getByText(/success/i)).toBeInTheDocument()
    expect(screen.getByText(/missed/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Wins, achievements...')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Missed opportunities...')).toBeInTheDocument()
  })

  it('calls onScoreChange when score buttons are clicked', async () => {
    const onScoreChange = vi.fn()
    render(<IntegrityEditForm {...defaultProps} onScoreChange={onScoreChange} />)

    await userEvent.click(screen.getByText(/missed/i))
    expect(onScoreChange).toHaveBeenCalledWith(0)

    await userEvent.click(screen.getByText(/success/i))
    expect(onScoreChange).toHaveBeenCalledWith(1)
  })

  it('calls onSave when form is submitted', async () => {
    const onSave = vi.fn()
    render(<IntegrityEditForm {...defaultProps} onSave={onSave} />)

    await userEvent.click(screen.getByText('Save'))
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('calls onCancel when cancel is clicked', async () => {
    const onCancel = vi.fn()
    render(<IntegrityEditForm {...defaultProps} onCancel={onCancel} />)

    await userEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows saving state when isPending', () => {
    render(<IntegrityEditForm {...defaultProps} isPending={true} />)
    expect(screen.getByText('Saving...')).toBeInTheDocument()
  })

  it('disables submit button when isPending', () => {
    render(<IntegrityEditForm {...defaultProps} isPending={true} />)
    expect(screen.getByText('Saving...')).toBeDisabled()
  })
})
