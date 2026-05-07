import { useState } from 'react';
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '@/hooks/useTags';
import type { CreateTagRequest, Tag } from '@/types';
import './tag-manage-modal.less';

const CATEGORIES = [
  { id: 'Food', icon: '🍴', color: '#f97316' },
  { id: 'Groceries', icon: '🛒', color: '#3b82f6' },
  { id: 'Transport', icon: '🚌', color: '#f59e0b' },
  { id: 'Shopping', icon: '🛍️', color: '#ec4899' },
  { id: 'Bills', icon: '📄', color: '#64748b' },
  { id: 'Entertainment', icon: '🎮', color: '#a855f7' },
  { id: 'Health', icon: '💊', color: '#10b981' },
  { id: 'Other', icon: '📦', color: '#6b7280' },
] as const;

export type TagManageModalProps = {
  initialMode?: 'list' | 'create' | 'edit';
  initialDraft?: Partial<CreateTagRequest>;
  initialEditId?: number;
  onClose: () => void;
};

type FormState = {
  name: string;
  category: string;
  amount: string;
  note: string;
  icon: string;
  color: string;
};

const draftToForm = (draft: Partial<CreateTagRequest> | undefined): FormState => {
  const cat = draft?.category ?? 'Other';
  const catEntry = CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[7];
  return {
    name: draft?.name ?? '',
    category: cat,
    amount: draft?.amount !== undefined ? String(draft.amount) : '',
    note: draft?.note ?? '',
    icon: draft?.icon ?? catEntry.icon,
    color: draft?.color ?? catEntry.color,
  };
};

const tagToForm = (tag: Tag): FormState => ({
  name: tag.name,
  category: tag.category,
  amount: String(tag.amount),
  note: tag.note ?? '',
  icon: tag.icon,
  color: tag.color,
});

const TagManageModal = ({
  initialMode = 'list',
  initialDraft,
  initialEditId,
  onClose,
}: TagManageModalProps) => {
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>(initialMode);
  const [editingId, setEditingId] = useState<number | undefined>(initialEditId);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<FormState>(() => draftToForm(initialDraft));
  const [error, setError] = useState<string | null>(null);

  const { data: tags } = useTags(showArchived);
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const handleCategoryClick = (cat: (typeof CATEGORIES)[number]) => {
    setForm((f) => ({
      ...f,
      category: cat.id,
      icon: f.icon === '' || CATEGORIES.some((c) => c.icon === f.icon) ? cat.icon : f.icon,
      color: f.color === '' || CATEGORIES.some((c) => c.color === f.color) ? cat.color : f.color,
    }));
  };

  const handleSave = () => {
    setError(null);
    const trimmedName = form.name.trim();
    if (!trimmedName) return setError('name is required');
    const amountNum = parseFloat(form.amount);
    if (!Number.isFinite(amountNum) || amountNum < 0)
      return setError('amount must be a non-negative number');
    if (!form.icon) return setError('icon is required');
    if (!form.color) return setError('color is required');

    const payload = {
      name: trimmedName,
      category: form.category,
      amount: amountNum,
      note: form.note || undefined,
      icon: form.icon,
      color: form.color,
    };

    if (mode === 'edit' && editingId !== undefined) {
      updateTag.mutate(
        { id: editingId, data: payload },
        { onSuccess: () => setMode('list') },
      );
    } else {
      createTag.mutate(payload, {
        onSuccess: () => {
          if (initialDraft) onClose();
          else setMode('list');
        },
      });
    }
  };

  const startEdit = (tag: Tag) => {
    setForm(tagToForm(tag));
    setEditingId(tag.id);
    setMode('edit');
    setError(null);
  };

  return (
    <div className="tag-manage-modal__backdrop" onClick={onClose}>
      <div className="tag-manage-modal__card" onClick={(e) => e.stopPropagation()}>
        <header className="tag-manage-modal__header">
          <h3>
            {mode === 'list' ? 'Manage tags' : mode === 'edit' ? 'Edit tag' : 'New tag'}
          </h3>
          <button
            type="button"
            className="tag-manage-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {mode === 'list' && (
          <div className="tag-manage-modal__body">
            <label className="tag-manage-modal__archive-toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
            {(tags ?? []).map((tag) => (
              <div key={tag.id} className="tag-manage-modal__row">
                <span
                  className="tag-manage-modal__row-icon"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.icon}
                </span>
                <span className="tag-manage-modal__row-name">{tag.name}</span>
                <span className="tag-manage-modal__row-meta">
                  {tag.category} · ₪{tag.amount.toFixed(2)}
                </span>
                <button
                  type="button"
                  className="tag-manage-modal__row-edit"
                  onClick={() => startEdit(tag)}
                  aria-label="Edit"
                >
                  ✏️ Edit
                </button>
                {tag.isArchived ? (
                  <button
                    type="button"
                    onClick={() => updateTag.mutate({ id: tag.id, data: { isArchived: false } })}
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => deleteTag.mutate(tag.id)}
                    aria-label="Archive"
                  >
                    Archive
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="tag-manage-modal__new"
              onClick={() => {
                setForm(draftToForm(undefined));
                setEditingId(undefined);
                setMode('create');
                setError(null);
              }}
            >
              + New tag
            </button>
          </div>
        )}

        {(mode === 'create' || mode === 'edit') && (
          <div className="tag-manage-modal__body">
            <label>
              Name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <div className="tag-manage-modal__cat-row">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCategoryClick(c)}
                  className={
                    form.category === c.id
                      ? 'tag-manage-modal__cat tag-manage-modal__cat--active'
                      : 'tag-manage-modal__cat'
                  }
                  style={form.category === c.id ? { backgroundColor: c.color } : undefined}
                  aria-label={c.id}
                >
                  {c.icon}
                </button>
              ))}
            </div>
            <label>
              Amount
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </label>
            <label>
              Note
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>
            <label>
              Icon
              <input
                type="text"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                maxLength={4}
              />
            </label>
            <label>
              Color
              <input
                type="text"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                placeholder="#RRGGBB"
              />
            </label>
            {error && <p className="tag-manage-modal__error">{error}</p>}
            <div className="tag-manage-modal__actions">
              <button type="button" onClick={() => setMode('list')}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={createTag.isPending || updateTag.isPending}
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TagManageModal;
