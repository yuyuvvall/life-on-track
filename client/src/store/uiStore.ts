import { create } from 'zustand';

interface QuickAddState {
  isOpen: boolean;
  mode: 'expense' | 'task';
}

interface UIState {
  quickAdd: QuickAddState;
  openQuickAdd: (mode: 'expense' | 'task') => void;
  closeQuickAdd: () => void;
  
  integrityModalOpen: boolean;
  openIntegrityModal: () => void;
  closeIntegrityModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  quickAdd: {
    isOpen: false,
    mode: 'expense',
  },
  openQuickAdd: (mode) => set({ quickAdd: { isOpen: true, mode } }),
  closeQuickAdd: () => set((state) => ({ quickAdd: { ...state.quickAdd, isOpen: false } })),
  
  integrityModalOpen: false,
  openIntegrityModal: () => set({ integrityModalOpen: true }),
  closeIntegrityModal: () => set({ integrityModalOpen: false }),
}));

