import { useForm } from 'react-hook-form';
import { useExpenseRepayments, useAddRepayment, useDeleteRepayment } from '@/hooks/useExpenses';
import { showToast } from '@/store/toastStore';
import { formatCurrency, CURRENCY_SYMBOL } from '@/utils/currency';
import type { Expense } from '@/types';
import './repayment-modal.less';

export type RepaymentModalProps = {
  expense: Expense;
  onClose: () => void;
};

type FormValues = {
  amount: string;
  note: string;
  repaidAt: string;
};

const EPS = 1e-9;

const todayLocalIso = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

const RepaymentModal = ({ expense, onClose }: RepaymentModalProps) => {
  const { data: repayments = [], isLoading } = useExpenseRepayments(expense.id);
  const addRepayment = useAddRepayment();
  const deleteRepayment = useDeleteRepayment();

  // Sum the live list rather than trusting the (possibly stale) expense prop.
  const repaidTotal = repayments.reduce((sum, r) => sum + r.amount, 0);
  const remaining = Math.max(0, expense.amount - repaidTotal);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { amount: '', note: '', repaidAt: todayLocalIso() },
  });

  const onSubmit = (values: FormValues) => {
    const amount = parseFloat(values.amount);
    addRepayment.mutate(
      {
        id: expense.id,
        data: {
          amount,
          note: values.note.trim() || undefined,
          repaidAt: values.repaidAt || undefined,
        },
      },
      {
        onSuccess: () => {
          showToast({
            message: `Recorded ${formatCurrency(amount)} repaid on ${expense.category}`,
            variant: 'success',
          });
          reset({ amount: '', note: '', repaidAt: todayLocalIso() });
        },
        onError: (err: Error) => {
          showToast({ message: err.message || 'Could not record repayment', variant: 'error' });
        },
      },
    );
  };

  const handleDelete = (repaymentId: number) => {
    deleteRepayment.mutate(
      { id: expense.id, repaymentId },
      {
        onError: (err: Error) => {
          showToast({ message: err.message || 'Could not delete repayment', variant: 'error' });
        },
      },
    );
  };

  return (
    <div className="repayment-modal__backdrop" onClick={onClose}>
      <div className="repayment-modal__card" onClick={(e) => e.stopPropagation()}>
        <header className="repayment-modal__header">
          <h3>
            <span aria-hidden>↩</span> Repayments — {expense.category}{' '}
            {formatCurrency(expense.amount)}
          </h3>
          <button
            type="button"
            className="repayment-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="repayment-modal__body">
          {repayments.length > 0 && (
            <ul className="repayment-modal__list">
              {repayments.map((r) => (
                <li key={r.id} className="repayment-modal__item">
                  <span className="repayment-modal__item-amount">{formatCurrency(r.amount)}</span>
                  <span className="repayment-modal__item-detail">
                    {r.note && <span className="repayment-modal__item-note">{r.note} · </span>}
                    {formatDay(r.repaidAt)}
                  </span>
                  <button
                    type="button"
                    className="repayment-modal__item-delete"
                    onClick={() => handleDelete(r.id)}
                    disabled={deleteRepayment.isPending}
                    aria-label="Delete repayment"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!isLoading && repayments.length === 0 && (
            <p className="repayment-modal__empty">Nothing repaid yet.</p>
          )}

          <div className="repayment-modal__readout">
            <span className="repayment-modal__readout-label">Still on you</span>
            <span className="repayment-modal__readout-value">{formatCurrency(remaining)}</span>
          </div>

          <form className="repayment-modal__form" onSubmit={handleSubmit(onSubmit)}>
            <label>
              Amount repaid ({CURRENCY_SYMBOL})
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                autoFocus
                {...register('amount', {
                  required: 'amount is required',
                  validate: (v) => {
                    const n = parseFloat(v);
                    if (!Number.isFinite(n) || n <= 0) return 'enter an amount greater than 0';
                    if (n > remaining + EPS)
                      return `can't exceed the remaining ${formatCurrency(remaining)}`;
                    return true;
                  },
                })}
              />
            </label>

            <label>
              Who / what (optional)
              <input type="text" placeholder="e.g. Dana's share" {...register('note')} />
            </label>

            <label>
              Date received
              <input type="date" {...register('repaidAt', { required: true })} />
            </label>

            {errors.amount && <p className="repayment-modal__error">{errors.amount.message}</p>}

            <div className="repayment-modal__actions">
              <button type="button" onClick={onClose}>
                Done
              </button>
              <button type="submit" disabled={addRepayment.isPending || remaining <= EPS}>
                {addRepayment.isPending ? 'Saving…' : 'Add repayment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RepaymentModal;
