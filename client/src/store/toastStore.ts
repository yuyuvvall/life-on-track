import { create } from 'zustand';

export type ToastVariant = 'error' | 'info' | 'success';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  show: (toast: {
    message: string;
    variant?: ToastVariant;
    durationMs?: number;
    action?: ToastAction;
  }) => string;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  error: 5000,
  info: 3000,
  success: 2500,
};

let counter = 0;
const nextId = () => `toast-${Date.now()}-${++counter}`;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: ({ message, variant = 'info', durationMs, action }) => {
    const id = nextId();
    const toast: Toast = {
      id,
      message,
      variant,
      durationMs: durationMs ?? DEFAULT_DURATION[variant],
      action,
    };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    return id;
  },
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export function showToast(args: {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
  action?: ToastAction;
}): string {
  return useToastStore.getState().show(args);
}

export function dismissToast(id: string) {
  useToastStore.getState().dismiss(id);
}
