# Research: Instant UI Feedback for DB-Backed Actions

## Problem

Every user action that touches the DB currently blocks the UI until the server responds *and* a full query refetch completes. A checkbox toggle shouldn't feel like a form submission — but today it does, everywhere.

## Current Plumbing (as of 2026-04-17)

- **Data layer:** TanStack React Query for all reads and writes.
- **UI store:** Zustand — used only for modal open/close toggles, not data.
- **API client:** [client.ts](../../client/src/api/client.ts) — plain `fetch` wrapper, no retry, no queue.
- **Mutation pattern (universal):**
  ```ts
  useMutation({
    mutationFn: (data) => api.x(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['x'] }),
  })
  ```
- **Zero optimistic updates exist anywhere in the app.**
- **No use of `setQueryData`, `onMutate`, or rollback contexts.**
- **Blanket invalidation:** every mutation refetches the entire list, even if one field on one row changed.
- **Waterfall invalidations:** many mutations invalidate 2–3 query keys (`goals` + `goals/:id` + `weeklySummary`), causing parallel refetches that stall UI recovery.

## Pain Points In Scope

### Critical (feels broken)

| # | Action | File | Why it hurts |
|---|--------|------|--------------|
| 1 | Toggle task done (checkbox) | [task-card.tsx:35-38](../../client/src/components/task-card/task-card.tsx#L35-L38) | Most-used interaction; 200–500 ms to see the check |
| 2 | Toggle subtask done | [task-card.tsx:40-46](../../client/src/components/task-card/task-card.tsx#L40-L46) | Cascades to parent `canComplete` + completed count |
| 3 | Quick-log frequency goal (habits) | [goal-item.tsx:72-79](../../client/src/components/goals-progress/goal-item.tsx#L72-L79), [goal-detail-view.tsx:65-75](../../client/src/views/goal-detail-view/goal-detail-view.tsx#L65-L75), [closing-event-view.tsx:140-144](../../client/src/views/closing-event/closing-event-view.tsx#L140-L144) | Single-tap habit check — button disabled during round-trip |
| 4 | Delete expense | [expenses-view.tsx:100-105](../../client/src/views/expenses-view/expenses-view.tsx#L100-L105) | No loading state; card lingers; users double-click |
| 5 | Quick-add task WITH subtasks | [quick-add-modal.tsx:45-68](../../client/src/components/quick-add-modal/quick-add-modal.tsx#L45-L68) | Serial `mutateAsync` per subtask → N × latency before modal closes |
| 6 | Integrity score tap | [integrity-logger.tsx:33-56](../../client/src/components/integrity-logger/integrity-logger.tsx#L33-L56) | Score button — should feel like flipping a switch |
| 7 | Drag-drop task to calendar day | [weekly-calendar-view.tsx:177-201,249-279](../../client/src/components/weekly-calendar-view/weekly-calendar-view.tsx#L177-L201) | Card doesn't snap to drop zone; waits for refetch to reposition |
| 8 | Add subtask (inline) | [task-card.tsx:48-53](../../client/src/components/task-card/task-card.tsx#L48-L53) | New subtask appears only after full `['tasks']` refetch |

### High

| # | Action | File |
|---|--------|------|
| 9 | Swipe task complete | [task-card.tsx:88-103](../../client/src/components/task-card/task-card.tsx#L88-L103) |
| 10 | Delete subtask | [task-card.tsx:55-57](../../client/src/components/task-card/task-card.tsx#L55-L57) |
| 11 | Delete task | [focus-list.tsx:44-46](../../client/src/components/focus-list/focus-list.tsx#L44-L46) |
| 12 | Delete goal / archive | [goal-detail-view.tsx:77-83](../../client/src/views/goal-detail-view/goal-detail-view.tsx#L77-L83), [goals-summary-view.tsx:12-16](../../client/src/views/goals-summary-view/goals-summary-view.tsx#L12-L16) |
| 13 | Log numeric goal progress | [goal-detail-view.tsx:48-63](../../client/src/views/goal-detail-view/goal-detail-view.tsx#L48-L63) |

### Out of scope for this plan

Medium-severity modal/form flows (create/edit goal, edit task modal, edit goal log, add/edit expense, create recurring expense, submit weekly reflection, inline edit subtask text) and low-severity local-state interactions are deferred — they remain blocking but do not break the "click feels instant" promise that this plan targets.

## Query Keys in Play

- `['tasks']`
- `['goals']`, `['goals', id]`, `['goals', id, 'logs', limit]`
- `['expenses']`, `['recurringExpenses']`
- `['workLogs']`, `['workLogs', 'today']`
- `['weeklySummary']`, `['weeklySummary', weekStart]`

## Key Insights

1. **One pattern fits all.** Because every mutation uses the same structure, a single reusable helper — `useOptimisticMutation` — can cover the whole app.
2. **Replace invalidate with `setQueryData` where possible.** Most mutations have enough info to update the cache directly. Only keep invalidation as a background reconciliation step (`refetchOnSuccess: true`) for cross-query side effects (e.g. `weeklySummary`).
3. **Temp IDs for creates.** Use a sentinel `id: 'optimistic-<uuid>'` so cards can be rendered immediately and replaced when the server returns the real row.
4. **Parallelize the subtask-creation loop.** The quick-add flow is serial today — low-hanging fruit.
5. **Modals can close optimistically.** Close on click, show a toast if the server call fails.
6. **Deletes need an undo affordance.** Because errors become invisible when the card is already gone.
