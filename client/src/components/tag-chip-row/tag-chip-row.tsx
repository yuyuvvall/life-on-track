import { useState } from 'react';
import { useTags } from '@/hooks/useTags';
import { useCreateExpense, useDeleteExpense } from '@/hooks/useExpenses';
import { showToast } from '@/store/toastStore';
import type { Tag } from '@/types';
import TagManageModal from '@/components/tag-manage-modal';
import { formatCurrency } from '@/utils/currency';
import './tag-chip-row.less';

type CommonProps = {
  isCurrentMonth?: boolean;
};

type QuickAddProps = CommonProps & { mode: 'quick-add' };
type PrefillProps = CommonProps & {
  mode: 'prefill';
  selectedTagId?: number | null;
  onSelect: (tag: Tag | null) => void;
};

export type TagChipRowProps = QuickAddProps | PrefillProps;

const TagChipRow = (props: TagChipRowProps) => {
  const { data: tags, isLoading } = useTags(false);
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const [manageOpen, setManageOpen] = useState(false);
  const [manageInitialMode, setManageInitialMode] = useState<'list' | 'create'>('list');

  const handleQuickAdd = (tag: Tag) => {
    createExpense.mutate(
      {
        amount: tag.amount,
        category: tag.category,
        note: tag.note ?? undefined,
        tagId: tag.id,
        createdAt: new Date().toISOString(),
      },
      {
        onSuccess: (created) => {
          showToast({
            message: `Logged ${formatCurrency(tag.amount)} ${tag.name}`,
            variant: 'info',
            durationMs: 5000,
            action: created
              ? {
                  label: 'Undo',
                  onClick: () => deleteExpense.mutate(created.id),
                }
              : undefined,
          });
        },
      },
    );
  };

  const handleChipClick = (tag: Tag) => {
    if (props.mode === 'quick-add') {
      handleQuickAdd(tag);
    } else if (props.selectedTagId === tag.id) {
      props.onSelect(null);
    } else {
      props.onSelect(tag);
    }
  };

  if (isLoading) {
    return (
      <div className="tag-chip-row">
        <div className="tag-chip-row__skeleton" />
        <div className="tag-chip-row__skeleton" />
        <div className="tag-chip-row__skeleton" />
      </div>
    );
  }

  const hasTags = (tags?.length ?? 0) > 0;

  return (
    <>
      {props.mode === 'quick-add' && props.isCurrentMonth === false && (
        <p className="tag-chip-row__hint">(taps add to today)</p>
      )}
      <div className="tag-chip-row" role="list">
        {!hasTags ? (
          <button
            type="button"
            className="tag-chip-row__empty"
            onClick={() => {
              setManageInitialMode('create');
              setManageOpen(true);
            }}
          >
            + Create your first tag
          </button>
        ) : (
          tags!.map((tag) => {
            const isSelected =
              props.mode === 'prefill' && props.selectedTagId === tag.id;
            return (
              <button
                key={tag.id}
                type="button"
                className={`tag-chip-row__chip${
                  isSelected ? ' tag-chip-row__chip--selected' : ''
                }`}
                style={{ borderColor: tag.color }}
                onClick={() => handleChipClick(tag)}
                aria-label={`${tag.name} ${formatCurrency(tag.amount)}`}
              >
                <span
                  className="tag-chip-row__icon"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.icon}
                </span>
                <span className="tag-chip-row__name">{tag.name}</span>
                <span className="tag-chip-row__amount">
                  {formatCurrency(tag.amount, { space: true })}
                </span>
              </button>
            );
          })
        )}
        {hasTags && (
          <button
            type="button"
            className="tag-chip-row__manage"
            onClick={() => {
              setManageInitialMode('list');
              setManageOpen(true);
            }}
            aria-label="Manage tags"
          >
            ⚙️
          </button>
        )}
      </div>
      {manageOpen && (
        <TagManageModal
          initialMode={manageInitialMode}
          onClose={() => setManageOpen(false)}
        />
      )}
    </>
  );
};

export default TagChipRow;
