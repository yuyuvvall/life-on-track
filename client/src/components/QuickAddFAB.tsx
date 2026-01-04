import { useRef, useCallback } from 'react';
import { useUIStore } from '@/store/uiStore';

export function QuickAddFAB() {
  const { openQuickAdd } = useUIStore();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const handleTouchStart = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      openQuickAdd('task');
    }, 500);
  }, [openQuickAdd]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!isLongPress.current) {
      openQuickAdd('expense');
    }
  }, [openQuickAdd]);

  const handleMouseDown = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      openQuickAdd('task');
    }, 500);
  }, [openQuickAdd]);

  const handleMouseUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!isLongPress.current) {
      openQuickAdd('expense');
    }
  }, [openQuickAdd]);

  const handleMouseLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  return (
    <button
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      className="fixed bottom-6 right-6 w-14 h-14 bg-accent-blue rounded-full shadow-lg 
                 flex items-center justify-center text-white
                 hover:bg-blue-600 active:scale-95 transition-all z-40
                 touch-none select-none"
      title="Tap: Add Expense | Long press: Add Task"
    >
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    </button>
  );
}

