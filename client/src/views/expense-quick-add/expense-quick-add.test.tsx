import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ExpenseQuickAdd from './expense-quick-add';
import type { Category, Expense, PrepaidCard } from '@/types';

vi.mock('@/api/client', () => ({
  expensesApi: {
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  recurringExpensesApi: { create: vi.fn() },
  categoriesApi: { getAll: vi.fn() },
  cardsApi: { getAll: vi.fn() },
  tagsApi: { getAll: vi.fn() },
}));

const categories: Category[] = [
  { id: 1, name: 'Food', icon: '🍔', color: '#ef4444', sortOrder: 0, isArchived: false, isSystem: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, name: 'Groceries', icon: '🛒', color: '#22c55e', sortOrder: 1, isArchived: false, isSystem: true, createdAt: '2026-01-01T00:00:00.000Z' },
];

// A ₪40 card at 30% off with a ₪30 purchase already on it: the card reports the
// ₪10 that is left, because this expense's ₪30 is still drawn down against it.
const card: PrepaidCard = {
  id: 7, name: 'Shufersal', icon: '🛒', color: '#0ea5e9',
  defaultDiscountRate: 0.3, isArchived: false, createdAt: '2026-01-01T00:00:00.000Z',
  balance: 10, realValueRemaining: 7, lifetimeSavings: 12,
};

const otherCard: PrepaidCard = { ...card, id: 8, name: 'Rami Levy', balance: 5 };

const cardExpense: Expense = {
  id: 42, amount: 21, category: 'Food', categoryId: 1, note: null,
  createdAt: '2026-08-20T10:00:00.000Z', tagId: null,
  cardId: 7, faceAmount: 30, repaidTotal: 0,
};

const renderEdit = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/expense/edit/42']}>
        <Routes>
          <Route path="/expense/edit/:id" element={<ExpenseQuickAdd />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const submitKey = () =>
  document.querySelector('.expense-quick-add__submit-key') as HTMLButtonElement;

describe('ExpenseQuickAdd — editing a prepaid-card expense', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { expensesApi, categoriesApi, cardsApi, tagsApi } = await import('@/api/client');
    vi.mocked(expensesApi.getById).mockResolvedValue(cardExpense);
    vi.mocked(expensesApi.update).mockResolvedValue({ ...cardExpense, category: 'Groceries' });
    vi.mocked(categoriesApi.getAll).mockResolvedValue(categories);
    vi.mocked(cardsApi.getAll).mockResolvedValue([card, otherCard]);
    vi.mocked(tagsApi.getAll).mockResolvedValue([]);
  });

  // The bug: the ₪30 price tag was compared against the ₪10 the card has left,
  // so re-saving an untouched purchase looked like a ₪20 overdraft and the save
  // key stayed dead — even when only the category had changed.
  it('lets the category change through without calling it an overdraft', async () => {
    const user = userEvent.setup();
    renderEdit();

    await screen.findByText('Groceries');
    await waitFor(() => expect(screen.getByText('30')).toBeInTheDocument());

    expect(document.querySelector('.expense-quick-add__card-warning')).toBeNull();
    expect(submitKey()).not.toBeDisabled();

    await user.click(screen.getByText('Groceries'));
    await user.click(submitKey());

    const { expensesApi } = await import('@/api/client');
    await waitFor(() => expect(expensesApi.update).toHaveBeenCalledTimes(1));
    expect(vi.mocked(expensesApi.update).mock.calls[0][1]).toMatchObject({
      amount: 30, category: 'Groceries', cardId: 7,
    });
  });

  it('counts the face value it already holds as spendable on that card', async () => {
    renderEdit();
    await screen.findByText('Shufersal');
    // ₪10 left + the ₪30 this purchase is holding.
    await waitFor(() => expect(screen.getByText('₪40.00')).toBeInTheDocument());
    // The card it does not sit on shows its own balance, untouched.
    expect(screen.getByText('₪5.00')).toBeInTheDocument();
  });

  it('still blocks moving the purchase to a card that cannot cover it', async () => {
    const user = userEvent.setup();
    renderEdit();

    await screen.findByText('Rami Levy');
    await waitFor(() => expect(screen.getByText('30')).toBeInTheDocument());

    await user.click(screen.getByText('Rami Levy'));

    await waitFor(() =>
      expect(document.querySelector('.expense-quick-add__card-warning')).not.toBeNull(),
    );
    expect(screen.getByText(/Exceeds Rami Levy balance by ₪25\.00/)).toBeInTheDocument();
    expect(submitKey()).toBeDisabled();
  });
});
