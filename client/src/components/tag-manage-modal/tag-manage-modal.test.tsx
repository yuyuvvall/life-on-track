import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TagManageModal from './tag-manage-modal';
import type { Tag } from '@/types';

vi.mock('@/api/client', () => ({
  tagsApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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
  note: null,
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

describe('TagManageModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list mode shows existing tags with edit and archive controls', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    renderWithClient(<TagManageModal initialMode="list" onClose={() => {}} />);
    expect(await screen.findByText('Parking')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
  });

  it('create mode validates required fields', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([]);
    renderWithClient(<TagManageModal initialMode="create" onClose={() => {}} />);
    const save = await screen.findByRole('button', { name: /save/i });
    await userEvent.click(save);
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(tagsApi.create).not.toHaveBeenCalled();
  });

  it('archive button calls tagsApi.delete', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([sampleTag]);
    (tagsApi.delete as any).mockResolvedValue(undefined);
    renderWithClient(<TagManageModal initialMode="list" onClose={() => {}} />);
    await screen.findByText('Parking');
    await userEvent.click(screen.getByRole('button', { name: /archive/i }));
    expect(tagsApi.delete).toHaveBeenCalledWith(1, expect.any(String));
  });

  it('initialDraft pre-populates create form', async () => {
    const { tagsApi } = await import('@/api/client');
    (tagsApi.getAll as any).mockResolvedValue([]);
    renderWithClient(
      <TagManageModal
        initialMode="create"
        initialDraft={{
          name: 'Coffee',
          category: 'Food',
          amount: 15,
          note: 'Espresso',
          icon: '☕',
          color: '#f97316',
        }}
        onClose={() => {}}
      />,
    );
    const nameInput = await screen.findByLabelText(/name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Coffee');
    const amountInput = screen.getByLabelText(/amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe('15');
  });
});
