import { useMemo, useState } from 'react';
import {
  useCard,
  useCardActivity,
  useCardLoads,
  useDeleteCardLoad,
} from '@/hooks/useCards';
import { formatCurrency } from '@/utils/currency';
import { showToast } from '@/store/toastStore';
import CardLoadModal from '@/components/card-load-modal';
import type { CardActivityItem, CardLoad } from '@/types';
import './card-detail-modal.less';

export type CardDetailModalProps = {
  cardId: number;
  onClose: () => void;
};

type Tab = 'activity' | 'loads';

const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

const monthKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}`;
};

const CardDetailModal = ({ cardId, onClose }: CardDetailModalProps) => {
  const { data: card, isLoading } = useCard(cardId);
  const { data: activity = [] } = useCardActivity(cardId);
  const { data: loads = [] } = useCardLoads(cardId);
  const deleteLoad = useDeleteCardLoad();

  const [tab, setTab] = useState<Tab>('activity');
  const [showLoad, setShowLoad] = useState(false);

  // "Loaded this month" running total over the loads list (cash paid).
  const loadedThisMonth = useMemo(() => {
    const now = monthKey(new Date().toISOString());
    return loads.reduce((sum, l) => (monthKey(l.loadedAt) === now ? sum + l.cashPaid : sum), 0);
  }, [loads]);

  const handleDeleteLoad = (load: CardLoad) => {
    deleteLoad.mutate(
      { cardId, loadId: load.id },
      {
        onSuccess: () =>
          showToast({ message: `Removed load of ${formatCurrency(load.cashPaid)}`, variant: 'info' }),
        onError: (err: Error) =>
          showToast({
            message: err.message || 'Could not delete this load (it may have been spent from)',
            variant: 'error',
          }),
      },
    );
  };

  const renderActivity = (item: CardActivityItem) => {
    if (item.type === 'load') {
      return (
        <div key={`load-${item.id}`} className="card-detail-modal__activity-row">
          <span className="card-detail-modal__activity-icon card-detail-modal__activity-icon--load">
            ↑
          </span>
          <span className="card-detail-modal__activity-main">
            +{formatCurrency(item.faceValue)} for {formatCurrency(item.cashPaid)}
          </span>
          <span className="card-detail-modal__activity-date">{formatDay(item.at)}</span>
        </div>
      );
    }
    return (
      <div key={`pay-${item.id}`} className="card-detail-modal__activity-row">
        <span className="card-detail-modal__activity-icon card-detail-modal__activity-icon--pay">
          ↓
        </span>
        <span className="card-detail-modal__activity-main">
          {item.category ?? 'Expense'}{' '}
          {item.faceAmount !== null && item.faceAmount !== item.amount ? (
            <>
              {formatCurrency(item.faceAmount)} → {formatCurrency(item.amount)}
            </>
          ) : (
            formatCurrency(item.amount)
          )}
        </span>
        <span className="card-detail-modal__activity-date">{formatDay(item.at)}</span>
      </div>
    );
  };

  return (
    <div className="card-detail-modal__backdrop" onClick={onClose}>
      <div className="card-detail-modal__card" onClick={(e) => e.stopPropagation()}>
        <header className="card-detail-modal__header" style={{ borderColor: card?.color }}>
          <h3>
            <span aria-hidden>{card?.icon ?? '💳'}</span> {card?.name ?? 'Card'}
          </h3>
          <button
            type="button"
            className="card-detail-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {isLoading || !card ? (
          <div className="card-detail-modal__body">
            <p className="card-detail-modal__loading">Loading…</p>
          </div>
        ) : (
          <div className="card-detail-modal__body">
            <div className="card-detail-modal__stats">
              <div className="card-detail-modal__stat">
                <span className="card-detail-modal__stat-label">Balance</span>
                <span className="card-detail-modal__stat-value">{formatCurrency(card.balance)}</span>
              </div>
              <div className="card-detail-modal__stat">
                <span className="card-detail-modal__stat-label">Real value left</span>
                <span className="card-detail-modal__stat-value">
                  {formatCurrency(card.realValueRemaining)}
                </span>
              </div>
              <div className="card-detail-modal__stat">
                <span className="card-detail-modal__stat-label">Lifetime saved</span>
                <span className="card-detail-modal__stat-value card-detail-modal__stat-value--saved">
                  {formatCurrency(card.lifetimeSavings)}
                </span>
              </div>
            </div>

            <button
              type="button"
              className="card-detail-modal__load-btn"
              onClick={() => setShowLoad(true)}
            >
              + Load
            </button>

            <div className="card-detail-modal__tabs">
              <button
                type="button"
                className={`card-detail-modal__tab${tab === 'activity' ? ' card-detail-modal__tab--active' : ''}`}
                onClick={() => setTab('activity')}
              >
                Activity
              </button>
              <button
                type="button"
                className={`card-detail-modal__tab${tab === 'loads' ? ' card-detail-modal__tab--active' : ''}`}
                onClick={() => setTab('loads')}
              >
                Loads
              </button>
            </div>

            {tab === 'activity' ? (
              <div className="card-detail-modal__list">
                {activity.length === 0 ? (
                  <p className="card-detail-modal__empty">No activity yet.</p>
                ) : (
                  activity.map(renderActivity)
                )}
              </div>
            ) : (
              <div className="card-detail-modal__list">
                <div className="card-detail-modal__loaded-month">
                  Loaded this month: {formatCurrency(loadedThisMonth)}
                </div>
                {loads.length === 0 ? (
                  <p className="card-detail-modal__empty">No loads yet.</p>
                ) : (
                  loads.map((load) => {
                    const untouched = load.faceRemaining === load.faceValue;
                    return (
                      <div key={load.id} className="card-detail-modal__load-row">
                        <span className="card-detail-modal__load-main">
                          {formatCurrency(load.cashPaid)} → {formatCurrency(load.faceValue)}
                        </span>
                        <span className="card-detail-modal__load-date">{formatDay(load.loadedAt)}</span>
                        <button
                          type="button"
                          className="card-detail-modal__load-delete"
                          onClick={() => handleDeleteLoad(load)}
                          disabled={deleteLoad.isPending || !untouched}
                          title={
                            untouched
                              ? 'Delete this load'
                              : 'Already spent from — adjust the purchases first'
                          }
                          aria-label="Delete load"
                        >
                          🗑
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {showLoad && card && (
          <CardLoadModal card={card} onClose={() => setShowLoad(false)} />
        )}
      </div>
    </div>
  );
};

export default CardDetailModal;
