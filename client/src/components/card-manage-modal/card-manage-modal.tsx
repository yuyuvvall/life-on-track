import { useMemo, useState } from 'react';
import { useCards, useCreateCard, useUpdateCard, useDeleteCard } from '@/hooks/useCards';
import { CATEGORY_PALETTE } from '@/constants/categoryPalette';
import { formatCurrency } from '@/utils/currency';
import { showToast } from '@/store/toastStore';
import type { PrepaidCard } from '@/types';
import './card-manage-modal.less';

type Mode = 'list' | 'create' | 'edit';

type FormState = {
  name: string;
  icon: string;
  color: string;
  discountPct: string;
};

const FALLBACK_ICON = '💳';

const emptyForm = (): FormState => ({
  name: '',
  icon: FALLBACK_ICON,
  color: CATEGORY_PALETTE[7], // blue
  discountPct: '0',
});

const cardToForm = (card: PrepaidCard): FormState => ({
  name: card.name,
  icon: card.icon,
  color: card.color,
  discountPct: String(Math.round(card.defaultDiscountRate * 100)),
});

export type CardManageModalProps = {
  onClose: () => void;
};

const CardManageModal = ({ onClose }: CardManageModalProps) => {
  const [mode, setMode] = useState<Mode>('list');
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<PrepaidCard | null>(null);

  const { data: cards = [] } = useCards(true);
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();

  const visible = useMemo(
    () => [...cards].sort((a, b) => a.id - b.id).filter((c) => showArchived || !c.isArchived),
    [cards, showArchived],
  );

  const startCreate = () => {
    setForm(emptyForm());
    setEditingId(undefined);
    setError(null);
    setMode('create');
  };

  const startEdit = (card: PrepaidCard) => {
    setForm(cardToForm(card));
    setEditingId(card.id);
    setError(null);
    setMode('edit');
  };

  const handleSave = () => {
    setError(null);
    const trimmedName = form.name.trim();
    if (!trimmedName) return setError('name is required');
    if (!form.icon.trim()) return setError('icon is required');
    const pct = parseFloat(form.discountPct);
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100)
      return setError('discount must be between 0 and 99.99');

    const payload = {
      name: trimmedName,
      icon: form.icon.trim(),
      color: form.color,
      defaultDiscountRate: pct / 100,
    };

    if (mode === 'edit' && editingId !== undefined) {
      updateCard.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => setMode('list'),
          onError: (err: Error) => setError(err.message || 'Update failed'),
        },
      );
    } else {
      createCard.mutate(payload, {
        onSuccess: () => setMode('list'),
        onError: (err: Error) => setError(err.message || 'Create failed'),
      });
    }
  };

  const confirmArchive = () => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    deleteCard.mutate(target.id, {
      onSuccess: () => {
        showToast({ message: `Archived ${target.name}`, variant: 'info' });
        setArchiveTarget(null);
      },
      onError: (err: Error) => {
        showToast({ message: err.message || 'Could not archive', variant: 'error' });
        setArchiveTarget(null);
      },
    });
  };

  const handleUnarchive = (card: PrepaidCard) => {
    updateCard.mutate({ id: card.id, data: { isArchived: false } });
  };

  return (
    <div className="card-manage-modal__backdrop" onClick={onClose}>
      <div className="card-manage-modal__card" onClick={(e) => e.stopPropagation()}>
        <header className="card-manage-modal__header">
          <h3>{mode === 'list' ? 'Manage cards' : mode === 'edit' ? 'Edit card' : 'New card'}</h3>
          <button
            type="button"
            className="card-manage-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {mode === 'list' && (
          <div className="card-manage-modal__body">
            <label className="card-manage-modal__archive-toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
            {visible.map((card) => (
              <div key={card.id} className="card-manage-modal__row">
                <span className="card-manage-modal__row-icon" style={{ backgroundColor: card.color }}>
                  {card.icon}
                </span>
                <span className="card-manage-modal__row-name">{card.name}</span>
                <span className="card-manage-modal__row-meta">
                  {Math.round(card.defaultDiscountRate * 100)}% · {formatCurrency(card.balance)}
                </span>
                <button type="button" onClick={() => startEdit(card)} aria-label="Edit">
                  ✏️
                </button>
                {card.isArchived ? (
                  <button type="button" onClick={() => handleUnarchive(card)}>
                    Restore
                  </button>
                ) : (
                  <button type="button" onClick={() => setArchiveTarget(card)} aria-label="Archive">
                    Archive
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="card-manage-modal__new" onClick={startCreate}>
              + New card
            </button>
          </div>
        )}

        {(mode === 'create' || mode === 'edit') && (
          <div className="card-manage-modal__body">
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
            <label>
              Default discount (%)
              <input
                type="number"
                step="0.1"
                value={form.discountPct}
                onChange={(e) => setForm((f) => ({ ...f, discountPct: e.target.value }))}
              />
            </label>
            <div>
              <span className="card-manage-modal__palette-label">Color</span>
              <div className="card-manage-modal__palette">
                {CATEGORY_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={
                      form.color === c
                        ? 'card-manage-modal__swatch card-manage-modal__swatch--active'
                        : 'card-manage-modal__swatch'
                    }
                    style={{ backgroundColor: c }}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
            {error && <p className="card-manage-modal__error">{error}</p>}
            <div className="card-manage-modal__actions">
              <button type="button" onClick={() => setMode('list')}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={createCard.isPending || updateCard.isPending}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {archiveTarget && (
          <div
            className="card-manage-modal__archive-confirm"
            onClick={() => {
              if (!deleteCard.isPending) setArchiveTarget(null);
            }}
          >
            <div
              className="card-manage-modal__archive-confirm-card"
              onClick={(e) => e.stopPropagation()}
            >
              <h4>Archive {archiveTarget.name}?</h4>
              {archiveTarget.balance > 0 ? (
                <p>
                  This card still has {formatCurrency(archiveTarget.balance)} of balance
                  ({formatCurrency(archiveTarget.realValueRemaining)} real value). Archiving hides it
                  from pickers — you&apos;d be walking away from that unspent value.
                </p>
              ) : (
                <p>Balance is empty. Safe to archive.</p>
              )}
              <div className="card-manage-modal__actions">
                <button
                  type="button"
                  onClick={() => setArchiveTarget(null)}
                  disabled={deleteCard.isPending}
                >
                  Cancel
                </button>
                <button type="button" onClick={confirmArchive} disabled={deleteCard.isPending}>
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

export default CardManageModal;
