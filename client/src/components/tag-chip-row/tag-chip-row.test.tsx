import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TagChipRow from './tag-chip-row';
import type { Tag } from '@/types';

vi.mock('@/api/client', () => ({
  tagsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  expensesApi: {
    create: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
    getByDateRange: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
  },
  categoriesApi: {
    getAll: vi.fn().mockResolvedValue([]),
  },
}));

const sampleTag: Tag = {
  id: 1,
  name: 'Parking',
  category: 'Transport',
  categoryId: null,
  amount: 12,
  note: 'Lot near office',
  icon: '🅿️',
  color: '#f59e0b',
  isArchived: false,
  lastUsedAt: null,
  createdAt: '2026-05-01T08:00:00.000Z',
};

const renderWithClient = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

describe('TagChipRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a chip per non-archived tag', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    renderWithClient(<TagChipRow mode="quick-add" />);
    expect(await screen.findByRole('button', { name: /Parking/i })).toBeInTheDocument();
  });

  it('renders empty-state CTA when no tags', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([]);
    renderWithClient(<TagChipRow mode="quick-add" />);
    expect(await screen.findByRole('button', { name: /Create your first tag/i })).toBeInTheDocument();
  });

  it('mode="prefill" calls onSelect with the tag', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    const onSelect = vi.fn();
    renderWithClient(<TagChipRow mode="prefill" onSelect={onSelect} />);
    const chip = await screen.findByRole('button', { name: /Parking/i });
    await userEvent.click(chip);
    expect(onSelect).toHaveBeenCalledWith(sampleTag);
  });

  it('mode="quick-add" calls expensesApi.create with tag snapshot', async () => {
    const { tagsApi, expensesApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    (expensesApi.create as any).mockResolvedValue({ ...sampleTag, id: 99, tagId: 1 });
    renderWithClient(<TagChipRow mode="quick-add" />);
    const chip = await screen.findByRole('button', { name: /Parking/i });
    await userEvent.click(chip);
    await waitFor(() => {
      expect(expensesApi.create).toHaveBeenCalledTimes(1);
    });
    const call = (expensesApi.create as any).mock.calls[0][0];
    expect(call.amount).toBe(12);
    expect(call.category).toBe('Transport');
    expect(call.note).toBe('Lot near office');
    expect(call.tagId).toBe(1);
    expect(typeof call.createdAt).toBe('string');
  });

  it('shows "(taps add to today)" hint when isCurrentMonth=false', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    renderWithClient(<TagChipRow mode="quick-add" isCurrentMonth={false} />);
    expect(await screen.findByText(/taps add to today/i)).toBeInTheDocument();
  });
});
