import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SpendingChart from './spending-chart'

describe('SpendingChart', () => {
  it('renders categories with amounts', () => {
    render(
      <SpendingChart
        expensesByCategory={{ Food: 50, Transport: 30 }}
        totalExpenses={80}
      />
    )
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('Transport')).toBeInTheDocument()
    expect(screen.getByText('$50.00')).toBeInTheDocument()
    expect(screen.getByText('$30.00')).toBeInTheDocument()
  })

  it('renders total expenses', () => {
    render(
      <SpendingChart
        expensesByCategory={{ Food: 50 }}
        totalExpenses={50}
      />
    )
    expect(screen.getAllByText('$50.00').length).toBeGreaterThanOrEqual(1)
  })

  it('shows empty state when no expenses', () => {
    render(<SpendingChart expensesByCategory={{}} totalExpenses={0} />)
    expect(screen.getByText('No expenses this week')).toBeInTheDocument()
  })

  it('sorts categories by amount descending', () => {
    render(
      <SpendingChart
        expensesByCategory={{ Transport: 10, Food: 50, Bills: 30 }}
        totalExpenses={90}
      />
    )
    const labels = screen.getAllByText(/Food|Transport|Bills/)
    expect(labels[0]).toHaveTextContent('Food')
    expect(labels[1]).toHaveTextContent('Bills')
    expect(labels[2]).toHaveTextContent('Transport')
  })
})
