import type { Meta, StoryObj } from '@storybook/react-vite'
import SpendingChart from './spending-chart'

const meta = {
  title: 'SpendingChart',
  component: SpendingChart,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SpendingChart>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    expensesByCategory: {
      Food: 124.50,
      Transport: 45.00,
      Entertainment: 32.99,
      Shopping: 89.00,
      Bills: 150.00,
      Health: 25.00,
    },
    totalExpenses: 466.49,
  },
}

export const SingleCategory: Story = {
  args: {
    expensesByCategory: { Food: 87.50 },
    totalExpenses: 87.50,
  },
}

export const NoExpenses: Story = {
  args: {
    expensesByCategory: {},
    totalExpenses: 0,
  },
}

export const HighAmount: Story = {
  args: {
    expensesByCategory: {
      Bills: 2450.00,
      Food: 890.75,
      Transport: 340.00,
      Entertainment: 125.50,
    },
    totalExpenses: 3806.25,
  },
}
