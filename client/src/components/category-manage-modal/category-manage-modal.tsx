import { useMemo, useState } from 'react';
import { useCategories, useCreateCategory, useUpdateCategory, useArchiveCategory } from '@/hooks/useCategories';
import { categoriesApi } from '@/api/client';
import { CATEGORY_PALETTE } from '@/constants/categoryPalette';
import { showToast } from '@/store/toastStore';
import type { Category, CategoryDependents } from '@/types';
import './category-manage-modal.less';

type Mode = 'list' | 'create' | 'edit';

type FormState = {
  name: string;
  icon: string;
  color: string;
};

const FALLBACK_ICON = '📦';

const emptyForm = (): FormState => ({
  name: '',
  icon: FALLBACK_ICON,
  color: CATEGORY_PALETTE[0],
});

const categoryToForm = (cat: Category): FormState => ({
  name: cat.name,
  icon: cat.icon,
  color: cat.color,
});

export type CategoryManageModalProps = {
  onClose: () => void;
};

const CategoryManageModal = ({ onClose }: CategoryManageModalProps) => {
  const [mode, setMode] = useState<Mode>('list');
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);
  const [archiveDeps, setArchiveDeps] = useState<CategoryDependents | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const { data: categories = [] } = useCategories(true);
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const archiveCategory = useArchiveCategory();

  const visible = useMemo(() => {
    return [...categories]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .filter((c) => showArchived || !c.isArchived);
  }, [categories, showArchived]);

  const startCreate = () => {
    setForm(emptyForm());
    setEditingId(undefined);
    setError(null);
    setMode('create');
  };

  const startEdit = (cat: Category) => {
    setForm(categoryToForm(cat));
    setEditingId(cat.id);
    setError(null);
    setMode('edit');
  };

  const handleSave = () => {
    setError(null);
    const trimmedName = form.name.trim();
    if (!trimmedName) return setError('name is required');
    if (!form.icon.trim()) return setError('icon is required');
    if (!CATEGORY_PALETTE.includes(form.color as (typeof CATEGORY_PALETTE)[number])) {
      return setError('pick a color from the palette');
    }

    const payload = { name: trimmedName, icon: form.icon.trim(), color: form.color };

    if (mode === 'edit' && editingId !== undefined) {
      updateCategory.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => setMode('list'),
          onError: (err: Error) => setError(err.message || 'Update failed'),
        },
      );
    } else {
      createCategory.mutate(payload, {
        onSuccess: () => setMode('list'),
        onError: (err: Error) => setError(err.message || 'Create failed'),
      });
    }
  };

  const handleReorder = (cat: Category, direction: -1 | 1) => {
    const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    const idx = sorted.findIndex((c) => c.id === cat.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    // Swap their sort_order values.
    updateCategory.mutate({ id: cat.id, data: { sortOrder: other.sortOrder } });
    updateCategory.mutate({ id: other.id, data: { sortOrder: cat.sortOrder } });
  };

  const beginArchive = async (cat: Category) => {
    setArchiveTarget(cat);
    setArchiveDeps(null);
    setArchiveLoading(true);
    try {
      const detail = await categoriesApi.getById(cat.id, 'Check category dependents');
      setArchiveDeps(detail.dependents);
    } catch {
      // If the lookup fails, treat as no dependents — the user can still confirm.
      setArchiveDeps({ activeRecurring: 0, activeBudgets: 0, expensesLast30Days: 0 });
    } finally {
      setArchiveLoading(false);
    }
  };

  const confirmArchive = () => {
    if (!archiveTarget) return;
    archiveCategory.mutate(archiveTarget.id, {
      onSuccess: () => {
        showToast({ message: `Archived ${archiveTarget.name}`, variant: 'info' });
        setArchiveTarget(null);
        setArchiveDeps(null);
      },
      onError: (err: Error) => {
        showToast({ message: err.message || 'Could not archive', variant: 'error' });
        setArchiveTarget(null);
        setArchiveDeps(null);
      },
    });
  };

  const handleUnarchive = (cat: Category) => {
    updateCategory.mutate({ id: cat.id, data: { isArchived: false } });
  };

  return (
    <div className="category-manage-modal__backdrop" onClick={onClose}>
      <div className="category-manage-modal__card" onClick={(e) => e.stopPropagation()}>
        <header className="category-manage-modal__header">
          <h3>
            {mode === 'list' ? 'Manage categories' : mode === 'edit' ? 'Edit category' : 'New category'}
          </h3>
          <button
            type="button"
            className="category-manage-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {mode === 'list' && (
          <div className="category-manage-modal__body">
            <label className="category-manage-modal__archive-toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
            {visible.map((cat, i) => (
              <div key={cat.id} className="category-manage-modal__row">
                <span
                  className="category-manage-modal__row-icon"
                  style={{ backgroundColor: cat.color }}
                >
                  {cat.icon}
                </span>
                <span className="category-manage-modal__row-name">
                  {cat.name}
                  {cat.isSystem && (
                    <span className="category-manage-modal__row-system">system</span>
                  )}
                </span>
                <div className="category-manage-modal__row-reorder">
                  <button
                    type="button"
                    onClick={() => handleReorder(cat, -1)}
                    disabled={i === 0 || cat.isArchived}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReorder(cat, 1)}
                    disabled={i === visible.length - 1 || cat.isArchived}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </div>
                <button type="button" onClick={() => startEdit(cat)} aria-label="Edit">
                  ✏️
                </button>
                {cat.isArchived ? (
                  <button type="button" onClick={() => handleUnarchive(cat)}>
                    Restore
                  </button>
                ) : cat.isSystem ? (
                  <span className="category-manage-modal__row-meta">protected</span>
                ) : (
                  <button type="button" onClick={() => beginArchive(cat)}>
                    Archive
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="category-manage-modal__new" onClick={startCreate}>
              + New category
            </button>
          </div>
        )}

        {(mode === 'create' || mode === 'edit') && (
          <div className="category-manage-modal__body">
            <label>
              Name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label>
              Icon
              <input
                type="text"
                value={form.icon}
                maxLength={4}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              />
            </label>
            <div>
              <span className="category-manage-modal__palette-label">Color</span>
              <div className="category-manage-modal__palette">
                {CATEGORY_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={
                      form.color === c
                        ? 'category-manage-modal__swatch category-manage-modal__swatch--active'
                        : 'category-manage-modal__swatch'
                    }
                    style={{ backgroundColor: c }}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
            {error && <p className="category-manage-modal__error">{error}</p>}
            <div className="category-manage-modal__actions">
              <button type="button" onClick={() => setMode('list')}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={createCategory.isPending || updateCategory.isPending}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {archiveTarget && (
          <div
            className="category-manage-modal__archive-confirm"
            onClick={() => {
              if (!archiveCategory.isPending) {
                setArchiveTarget(null);
                setArchiveDeps(null);
              }
            }}
          >
            <div
              className="category-manage-modal__archive-confirm-card"
              onClick={(e) => e.stopPropagation()}
            >
              <h4>Archive {archiveTarget.name}?</h4>
              {archiveLoading || !archiveDeps ? (
                <p>Checking dependents…</p>
              ) : (
                <>
                  {archiveDeps.activeRecurring +
                    archiveDeps.activeBudgets +
                    archiveDeps.expensesLast30Days ===
                  0 ? (
                    <p>No active dependents. Safe to archive.</p>
                  ) : (
                    <ul className="category-manage-modal__deps">
                      {archiveDeps.activeRecurring > 0 && (
                        <li>
                          {archiveDeps.activeRecurring} active recurring expense
                          {archiveDeps.activeRecurring === 1 ? '' : 's'}
                        </li>
                      )}
                      {archiveDeps.activeBudgets > 0 && (
                        <li>
                          {archiveDeps.activeBudgets} active budget
                          {archiveDeps.activeBudgets === 1 ? '' : 's'}
                        </li>
                      )}
                      {archiveDeps.expensesLast30Days > 0 && (
                        <li>
                          {archiveDeps.expensesLast30Days} expense
                          {archiveDeps.expensesLast30Days === 1 ? '' : 's'} in the last 30 days
                        </li>
                      )}
                    </ul>
                  )}
                  <p className="category-manage-modal__deps-note">
                    They'll keep recording silently. The category will disappear from pickers.
                  </p>
                </>
              )}
              <div className="category-manage-modal__actions">
                <button
                  type="button"
                  onClick={() => {
                    setArchiveTarget(null);
                    setArchiveDeps(null);
                  }}
                  disabled={archiveCategory.isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmArchive}
                  disabled={archiveLoading || archiveCategory.isPending}
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryManageModal;
