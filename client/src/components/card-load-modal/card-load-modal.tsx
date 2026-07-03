import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateCardLoad } from '@/hooks/useCards';
import { showToast } from '@/store/toastStore';
import { formatCurrency, CURRENCY_SYMBOL } from '@/utils/currency';
import { balanceFromCash, cashFromBalance, round2 } from '@/utils/cardMath';
import type { PrepaidCard } from '@/types';
import './card-load-modal.less';

export type CardLoadModalProps = {
  card: PrepaidCard;
  onClose: () => void;
  /** Fires after a successful load (e.g. to re-enable Save in quick-add). */
  onLoaded?: () => void;
};

type FormValues = {
  cashPaid: string;
  balanceReceived: string;
  discountPct: string;
  loadedAt: string;
  note: string;
};

const todayLocalIso = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const CardLoadModal = ({ card, onClose, onLoaded }: CardLoadModalProps) => {
  const createLoad = useCreateCardLoad();

  // Which of the two amounts the user typed last. It is the source of truth:
  // the other one is derived from it via the discount rate, and on submit the
  // driving field decides what we send so the typed number lands exactly.
  const [lastEdited, setLastEdited] = useState<'cash' | 'face'>('cash');

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      cashPaid: '',
      balanceReceived: '',
      discountPct: String(Math.round(card.defaultDiscountRate * 100)),
      loadedAt: todayLocalIso(),
      note: '',
    },
  });

  const currentRate = (): number => {
    const pct = parseFloat(getValues('discountPct'));
    return Number.isFinite(pct) ? pct / 100 : 0;
  };

  // Recompute is driven only by user onChange events (never watch-effects), so
  // the programmatic setValue on the counterpart field can't loop back.
  const handleCashChange = (raw: string) => {
    setLastEdited('cash');
    const cash = parseFloat(raw);
    if (Number.isFinite(cash) && cash > 0) {
      setValue('balanceReceived', String(round2(balanceFromCash(cash, currentRate()))));
    } else {
      setValue('balanceReceived', '');
    }
  };

  const handleBalanceChange = (raw: string) => {
    setLastEdited('face');
    const face = parseFloat(raw);
    if (Number.isFinite(face) && face > 0) {
      setValue('cashPaid', String(round2(cashFromBalance(face, currentRate()))));
    } else {
      setValue('cashPaid', '');
    }
  };

  const handleRateChange = () => {
    if (lastEdited === 'cash') {
      const cash = parseFloat(getValues('cashPaid'));
      if (Number.isFinite(cash) && cash > 0) {
        setValue('balanceReceived', String(round2(balanceFromCash(cash, currentRate()))));
      }
    } else {
      const face = parseFloat(getValues('balanceReceived'));
      if (Number.isFinite(face) && face > 0) {
        setValue('cashPaid', String(round2(cashFromBalance(face, currentRate()))));
      }
    }
  };

  const onSubmit = (values: FormValues) => {
    const cash = parseFloat(values.cashPaid);
    const face = parseFloat(values.balanceReceived);
    const rateFraction = parseFloat(values.discountPct) / 100;
    // When the balance drove the entry, send it explicitly so the server
    // stores the typed number exactly and derives the rate from cash/face.
    // (If an edit-load UI is ever added, it should reuse this same logic —
    // PUT /cards/:id/loads/:loadId has the same faceValue semantics.)
    const data =
      lastEdited === 'face'
        ? {
            cashPaid: round2(cash),
            faceValue: round2(face),
            loadedAt: values.loadedAt || undefined,
            note: values.note.trim() || undefined,
          }
        : {
            cashPaid: cash,
            discountRate: rateFraction,
            loadedAt: values.loadedAt || undefined,
            note: values.note.trim() || undefined,
          };
    createLoad.mutate(
      { cardId: card.id, data },
      {
        onSuccess: () => {
          showToast({
            message: `Loaded ${formatCurrency(face)} onto ${card.name}`,
            variant: 'success',
          });
          onLoaded?.();
          onClose();
        },
        onError: (err: Error) => {
          showToast({ message: err.message || 'Could not load card', variant: 'error' });
        },
      },
    );
  };

  return (
    <div className="card-load-modal__backdrop" onClick={onClose}>
      <form
        className="card-load-modal__card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit(onSubmit)}
      >
        <header className="card-load-modal__header">
          <h3>
            <span aria-hidden>{card.icon}</span> Load {card.name}
          </h3>
          <button
            type="button"
            className="card-load-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="card-load-modal__body">
          <div className="card-load-modal__amounts">
            <label>
              Cash paid ({CURRENCY_SYMBOL})
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                autoFocus
                {...register('cashPaid', {
                  required: 'cash paid is required',
                  validate: (v) => {
                    const n = parseFloat(v);
                    if (!Number.isFinite(n) || n <= 0) return 'enter an amount greater than 0';
                    return true;
                  },
                  onChange: (e) => handleCashChange(e.target.value),
                })}
              />
            </label>

            <span className="card-load-modal__amounts-arrow" aria-hidden>
              ⇄
            </span>

            <label>
              Balance received ({CURRENCY_SYMBOL})
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                {...register('balanceReceived', {
                  required: 'balance received is required',
                  validate: (v) => {
                    const n = parseFloat(v);
                    if (!Number.isFinite(n) || n <= 0) return 'enter an amount greater than 0';
                    const cash = parseFloat(getValues('cashPaid'));
                    if (Number.isFinite(cash) && n < cash)
                      return 'balance received cannot be less than cash paid';
                    return true;
                  },
                  onChange: (e) => handleBalanceChange(e.target.value),
                })}
              />
            </label>
          </div>

          <label>
            Discount (%)
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              {...register('discountPct', {
                required: 'discount is required',
                validate: (v) => {
                  const n = parseFloat(v);
                  if (!Number.isFinite(n) || n < 0 || n >= 100)
                    return 'discount must be between 0 and 99.99';
                  return true;
                },
                onChange: () => handleRateChange(),
              })}
            />
          </label>

          <label>
            Date charged
            <input type="date" {...register('loadedAt', { required: true })} />
          </label>

          <label>
            Note (optional)
            <input type="text" placeholder="confirmation #" {...register('note')} />
          </label>

          {(errors.cashPaid || errors.balanceReceived || errors.discountPct) && (
            <p className="card-load-modal__error">
              {errors.cashPaid?.message ||
                errors.balanceReceived?.message ||
                errors.discountPct?.message}
            </p>
          )}
        </div>

        <div className="card-load-modal__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={createLoad.isPending}>
            {createLoad.isPending ? 'Loading…' : 'Load'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CardLoadModal;
