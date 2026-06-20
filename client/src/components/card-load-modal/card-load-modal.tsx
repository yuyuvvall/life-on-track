import { useForm } from 'react-hook-form';
import { useCreateCardLoad } from '@/hooks/useCards';
import { showToast } from '@/store/toastStore';
import { formatCurrency, CURRENCY_SYMBOL } from '@/utils/currency';
import { balanceFromCash } from '@/utils/cardMath';
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

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      cashPaid: '',
      discountPct: String(Math.round(card.defaultDiscountRate * 100)),
      loadedAt: todayLocalIso(),
      note: '',
    },
  });

  const cashRaw = watch('cashPaid');
  const pctRaw = watch('discountPct');
  const cashPaid = parseFloat(cashRaw);
  const pct = parseFloat(pctRaw);
  const rate = Number.isFinite(pct) ? pct / 100 : 0;
  const balance =
    Number.isFinite(cashPaid) && cashPaid > 0 ? balanceFromCash(cashPaid, rate) : 0;

  const onSubmit = (values: FormValues) => {
    const cash = parseFloat(values.cashPaid);
    const pctNum = parseFloat(values.discountPct);
    const rateFraction = pctNum / 100;
    createLoad.mutate(
      {
        cardId: card.id,
        data: {
          cashPaid: cash,
          discountRate: rateFraction,
          loadedAt: values.loadedAt || undefined,
          note: values.note.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          showToast({
            message: `Loaded ${formatCurrency(balanceFromCash(cash, rateFraction))} onto ${card.name}`,
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
              })}
            />
          </label>

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
              })}
            />
          </label>

          <div className="card-load-modal__readout">
            <span className="card-load-modal__readout-label">Balance you&apos;ll get</span>
            <span className="card-load-modal__readout-value">{formatCurrency(balance)}</span>
          </div>

          <label>
            Date charged
            <input type="date" {...register('loadedAt', { required: true })} />
          </label>

          <label>
            Note (optional)
            <input type="text" placeholder="confirmation #" {...register('note')} />
          </label>

          {(errors.cashPaid || errors.discountPct) && (
            <p className="card-load-modal__error">
              {errors.cashPaid?.message || errors.discountPct?.message}
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
