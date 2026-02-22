# Phase 1: Unify Week Start to Sunday

## Overview

The app has two places where the week incorrectly starts on **Monday** instead of **Sunday**. The rest of the codebase (getWeekStart, getWeekEnd, WeeklyCalendarView, IntegrityHeatmap, goals frequency tracking) uses **Sunday** as the week start. This phase fixes the inconsistencies.

**Target convention:** Sunday = 0, Monday = 1, ..., Saturday = 6 (JavaScript `Date.getDay()` native convention)

---

## Affected Locations (from REASERCH.md)

| Location | Current | Target |
|----------|---------|--------|
| `server/src/routes/recurringExpenses.ts:271` | Mon=0 via `(getDay()+6)%7` | Sun=0 via `getDay()` |
| `client/src/views/ExpenseQuickAdd.tsx` | Calendar grid Mon-first, `DAYS_OF_WEEK` Mon-first | Sun-first (match IntegrityHeatmap) |

---

## Part A: Recurring Expenses (Server + Client)

### A.1 Server: `recurringExpenses.ts`

**Current logic (line 271):**
```ts
const dayOfWeek = (today.getDay() + 6) % 7; // Convert to Mon=0, Sun=6
```

**Fix:** Use native JS convention directly:
```ts
const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
```

**Validation message (lines 88-90):** Update from "Mon-Sun" to "Sun-Sat":
```ts
if (recurrenceType === 'weekly' && (recurrenceDay < 0 || recurrenceDay > 6)) {
  return res.status(400).json({ message: 'Weekly recurrence day must be 0-6 (Sun-Sat)' });
}
```

### A.2 Client: `ExpenseQuickAdd.tsx`

**Current:** `DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']` (index 0 = Monday)

**Fix:** Align with `IntegrityHeatmap` and `WeeklyCalendarView`:
```ts
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
```

**Reuse:** Extract to a shared constant. Both `IntegrityHeatmap.tsx` and `WeeklyCalendarView.tsx` use `['Sun', 'Mon', ...]`. Create `client/src/utils/dateConstants.ts`:

```ts
// Week starts on Sunday (matches getWeekStart, getWeekEnd, IntegrityHeatmap, WeeklyCalendarView)
export const WEEK_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
```

Then in `ExpenseQuickAdd.tsx`:
```ts
import { WEEK_DAY_NAMES } from '@/utils/dateConstants';

// Replace DAYS_OF_WEEK with WEEK_DAY_NAMES
```

**RecurringOptionsModal default (line 458):** Change comment from "Default to Monday" to "Default to Sunday":
```ts
setTempDay(0); // Default to Sunday (index 0 in Sun-Sat convention)
```

**Note:** No database migration needed — there are no existing `recurring_expenses` rows.

---

## Part B: ExpenseQuickAdd Calendar Grid

### B.1 `getCalendarDays()` in `DatePickerModal`

**Current (lines 419-436):**
```ts
const getCalendarDays = () => {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  // Adjust for Monday start (0 = Sunday, so we convert)
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;
  
  const days: (number | null)[] = [];
  
  // Empty cells before first day
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  
  // Days of the month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(i);
  }
  
  return days;
};
```

**Fix:** Use Sunday-first (no conversion). `firstDay.getDay()` already returns 0 for Sunday:
```ts
const getCalendarDays = () => {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  // Sunday-first: getDay() returns 0=Sun, 1=Mon, ..., 6=Sat
  const startDay = firstDay.getDay();
  
  const days: (number | null)[] = [];
  
  // Empty cells before first day
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  
  // Days of the month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(i);
  }
  
  return days;
};
```

### B.2 Day Header Row in `DatePickerModal`

**Current (line 419):**
```ts
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];  // Mon-Sun
```

**Fix:** Sunday-first to match the grid:
```ts
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];  // Sun-Sat
```

**Reuse:** This could come from `WEEK_DAY_NAMES`:
```ts
const DAYS = WEEK_DAY_NAMES.map(d => d[0]);  // ['S','M','T','W','T','F','S']
```

---

## Implementation Order

1. **Create shared constant** — `client/src/utils/dateConstants.ts` with `WEEK_DAY_NAMES`
2. **Server** — Update `recurringExpenses.ts` (dayOfWeek + validation message)
3. **Client ExpenseQuickAdd** — Update `DAYS_OF_WEEK` → `WEEK_DAY_NAMES`, `getCalendarDays()`, `DAYS` header, RecurringOptionsModal default
4. **Optional refactor** — Replace `DAY_NAMES` in `IntegrityHeatmap` and `DAY_NAMES` in `WeeklyCalendarView` with `WEEK_DAY_NAMES` from the new utils file (reuse)

---

## Code Snippets Summary

### New file: `client/src/utils/dateConstants.ts`
```ts
/**
 * Week day names in Sunday-first order.
 * Matches JavaScript Date.getDay(): 0=Sun, 1=Mon, ..., 6=Sat.
 * Used by: IntegrityHeatmap, WeeklyCalendarView, ExpenseQuickAdd, getWeekStart.
 */
export const WEEK_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
```

### Server `recurringExpenses.ts` diff
```diff
-    const dayOfWeek = (today.getDay() + 6) % 7; // Convert to Mon=0, Sun=6
+    const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
```
```diff
-    return res.status(400).json({ message: 'Weekly recurrence day must be 0-6 (Mon-Sun)' });
+    return res.status(400).json({ message: 'Weekly recurrence day must be 0-6 (Sun-Sat)' });
```

### Client `ExpenseQuickAdd.tsx` — RecurringOptionsModal
```diff
-  const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
+  // Use shared constant; index 0 = Sunday
+  const DAYS_OF_WEEK = WEEK_DAY_NAMES;
```
```diff
-                setTempDay(0); // Default to Monday
+                setTempDay(0); // Default to Sunday
```

### Client `ExpenseQuickAdd.tsx` — DatePickerModal getCalendarDays
```diff
-    // Adjust for Monday start (0 = Sunday, so we convert)
-    let startDay = firstDay.getDay() - 1;
-    if (startDay < 0) startDay = 6;
+    // Sunday-first: getDay() returns 0=Sun, 1=Mon, ..., 6=Sat
+    const startDay = firstDay.getDay();
```

### Client `ExpenseQuickAdd.tsx` — DatePickerModal DAYS
```diff
-  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
+  const DAYS = WEEK_DAY_NAMES.map(d => d[0]);  // ['S','M','T','W','T','F','S']
```

---

## Verification Checklist

- [ ] New recurring expense "Every Sunday" (index 0) generates on Sundays
- [ ] ExpenseQuickAdd date picker: first column is Sunday, month grid aligns correctly
- [ ] RecurringOptionsModal: day labels Sun–Sat, index 0 = Sunday
- [ ] `getRecurrenceLabel()` displays correct day name for stored `recurrenceDay`
