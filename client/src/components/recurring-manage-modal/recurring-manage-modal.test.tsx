import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecurringManageModal from './recurring-manage-modal';
import type { RecurringExpense } from '@/types';

vi.mock('@/api/client', () => ({
  recurringExpensesApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    generate: vi.fn(),
  },
  categoriesApi: {
    getAll: vi.fn().mockResolvedValue([]),
  },
  tagsApi: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/store/toastStore', () => ({
  showToast: vi.fn(),
}));

const sample: RecurringExpense = {
  id: 1,
  amount: 450,
  category: 'Subscriptions',
  categoryId: 3,
  note: null,
  recurrenceType: 'monthly',
  recurrenceDay: 5,
  isActive: true,
  lastGeneratedDate: null,
  tagId: null,
  createdAt: '2026-04-01T00:00:00.000Z',
};

const renderWithClient = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('RecurringManageModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list mode renders templates with schedule label and actions', async () => {
    const { recurringExpensesApi } = await import('@/api/client');
    (recurringExpensesApi.getAll as any).mockResolvedValue([sample]);
    renderWithClient(<RecurringManageModal onClose={() => {}} />);
    expect(await screen.findByText('Subscriptions')).toBeInTheDocument();
    expect(screen.getByText(/every month on the 5th/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('pause toggle calls update with isActive: false', async () => {
    const { recurringExpensesApi } = await import('@/api/client');
    (recurringExpensesApi.getAll as any).mockResolvedValue([sample]);
    (recurringExpensesApi.update as any).mockResolvedValue(sample);
    renderWithClient(<RecurringManageModal onClose={() => {}} />);
    await screen.findByText('Subscriptions');
    await userEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(recurringExpensesApi.update).toHaveBeenCalledWith(
      1,
      { isActive: false },
      expect.any(String),
    );
  });

  it('delete requires two taps then calls delete', async () => {
    const { recurringExpensesApi } = await import('@/api/client');
    (recurringExpensesApi.getAll as any).mockResolvedValue([sample]);
    (recurringExpensesApi.delete as any).mockResolvedValue(undefined);
    renderWithClient(<RecurringManageModal onClose={() => {}} />);
    await screen.findByText('Subscriptions');
    const delBtn = screen.getByRole('button', { name: /^delete$/i });
    await userEvent.click(delBtn);
    expect(recurringExpensesApi.delete).not.toHaveBeenCalled();
    // After first tap the button flips to "Confirm delete"
    await userEvent.click(screen.getByRole('button', { name: /confirm delete/i }));
    expect(recurringExpensesApi.delete).toHaveBeenCalledWith(1, expect.any(String));
  });

  it('edit mode saves changes via update', async () => {
    const { recurringExpensesApi } = await import('@/api/client');
    (recurringExpensesApi.getAll as any).mockResolvedValue([sample]);
    (recurringExpensesApi.update as any).mockResolvedValue({ ...sample, amount: 99 });
    renderWithClient(<RecurringManageModal onClose={() => {}} />);
    await screen.findByText('Subscriptions');
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    const amountInput = (await screen.findByDisplayValue('450')) as HTMLInputElement;
    await userEvent.clear(amountInput);
    await userEvent.type(amountInput, '99');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(recurringExpensesApi.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ amount: 99, category: 'Subscriptions' }),
      expect.any(String),
    );
  });

  it('empty state prompts user when no recurring exist', async () => {
    const { recurringExpensesApi } = await import('@/api/client');
    (recurringExpensesApi.getAll as any).mockResolvedValue([]);
    renderWithClient(<RecurringManageModal onClose={() => {}} />);
    expect(await screen.findByText(/no recurring expenses yet/i)).toBeInTheDocument();
  });
});
