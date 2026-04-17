import { useEffect } from 'react';
import { useToastStore, type Toast } from '@/store/toastStore';
import './toast-host.less';

const ToastItem = ({ toast }: { toast: Toast }) => {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const timer = window.setTimeout(() => dismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.durationMs, dismiss]);

  const handleAction = () => {
    toast.action?.onClick();
    dismiss(toast.id);
  };

  return (
    <div className={`toast-host__item toast-host__item--${toast.variant}`}>
      <span className="toast-host__message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={handleAction}
          className="toast-host__action"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        className="toast-host__close"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
};

const ToastHost = () => {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
};

export default ToastHost;
