# Plan: Instant UI Feedback for DB-Backed Actions

**Date:** 2026-04-17
**Scope:** Convert blocking mutations across the client app to optimistic updates so every click feels instant; the server write happens in the background, and errors roll back with a visible toast.

See [RESEARCH.md](./RESEARCH.md) for the full audit.

---

## Design Principles

1. **Optimistic-first.** Every mutation updates the React Query cache *before* the request fires.
2. **Rollback on error.** `onError` restores the previous cache snapshot and surfaces a toast.
3. **Granular updates over blanket invalidation.** Use `setQueryData`; invalidate only for cross-query reconciliation (`weeklySummary`, server-computed fields).
4. **Temp IDs for creates.** Client generates `optimistic-<uuid>`; swap to server ID `onSuccess`.
5. **Undo for destructive actions.** A 5-second toast with "Undo" before the delete is considered final.

---

## Phase 0 — Foundation (build once, reuse everywhere)

**Goal:** a single helper that makes every subsequent phase a 5-line change.

### 0.1 Add a reusable `useOptimisticMutation` hook

**New file:** `client/src/hooks/useOptimisticMutation.ts`

Thin wrapper over `useMutation` that standardizes:
- `onMutate`: snapshot affected query data, apply caller-supplied `optimisticUpdate(cache, variables)`, return snapshot as context.
- `onError`: restore snapshot from context, call a toast helper.
- `onSettled`: optionally invalidate cross-cutting keys (default: none; caller opts in).

Shape:
```ts
useOptimisticMutation<TData, TVars>({
  mutationFn,
  queryKeys: QueryKey[],                 // keys to snapshot + rollback
  optimisticUpdate: (qc, vars) => void,  // mutate cache directly
  onServerSuccess?: (qc, data, vars) => void, // swap temp ID, merge server fields
  invalidateOnSettled?: QueryKey[],      // e.g. ['weeklySummary']
  errorMessage: string,
})
```

### 0.2 Add a lightweight toast system

**New file:** `client/src/components/toast/toast-host.tsx` + `client/src/store/toastStore.ts` (Zustand).
- `showToast({ message, variant, action? })`
- Variants: `error` (red, 5s) for rollbacks, `info` (neutral, 3s) for undo.
- Mount `<ToastHost />` once in [App.tsx](../../client/src/App.tsx).

### 0.3 Add a temp-ID helper

**New file:** `client/src/utils/optimisticId.ts` → `optimisticId() => 'optimistic-' + crypto.randomUUID()`.
Type guards: `isOptimistic(id)`.

### 0.4 Keep an escape hatch

Do **not** rewrite `useTasks.ts` / `useGoals.ts` etc. wholesale. Only convert the specific mutations listed below. The plain `useMutation` pattern stays valid elsewhere.

---

## Phase 1 — Critical wins (the "feels broken" list)

Each item follows the same pattern: replace `useMutation` + `invalidateQueries` with `useOptimisticMutation` and wire an `optimisticUpdate` that directly mutates the cache.

### 1.1 Toggle task done — [useTasks.ts](../../client/src/hooks/useTasks.ts) `useUpdateTask`
- Cache key: `['tasks']`.
- Optimistic: flip `isCompleted`, move task across completed/active groupings.
- Success merge: accept server response fields (e.g. `completedAt`).

### 1.2 Toggle subtask done — `useUpdateSubTask`
- Cache key: `['tasks']`.
- Optimistic: update the subtask entry inside its parent task's `subTasks` array.
- Also recompute parent `canComplete` client-side so the task's checkbox enables instantly.

### 1.3 Quick-log frequency goal — `useLogGoalProgress`
- Cache keys: `['goals']`, `['goals', id]`.
- Optimistic: increment `currentValue`, bump streak if applicable, append a pending log entry with temp ID.
- `invalidateOnSettled`: `['weeklySummary']` (server computes).
- Affects three call sites — [goal-item.tsx:72](../../client/src/components/goals-progress/goal-item.tsx#L72), [goal-detail-view.tsx:65](../../client/src/views/goal-detail-view/goal-detail-view.tsx#L65), [closing-event-view.tsx:140](../../client/src/views/closing-event/closing-event-view.tsx#L140). One hook change fixes all.

### 1.4 Delete expense — `useDeleteExpense`
- Cache key: `['expenses']`.
- Optimistic: filter out the row immediately.
- Add undo via toast: show "Expense deleted — Undo" for 5s; click Undo = cancel mutation if not-yet-sent or re-POST on failure. Simplest first cut: show the toast, restore on error.
- Fix: [expenses-view.tsx:100-105](../../client/src/views/expenses-view/expenses-view.tsx#L100-L105) currently has no loading state either — remove the browser `confirm()` dialog, rely on undo toast.

### 1.5 Quick-add task with subtasks — [quick-add-modal.tsx:45-68](../../client/src/components/quick-add-modal/quick-add-modal.tsx#L45-L68)
Three changes, all visible instantly:
1. **Close modal immediately** on submit. Don't wait for any mutation.
2. **Parallelize subtask creation:** replace the serial `for…await` loop with `Promise.all(subtasks.map(...))`.
3. **Optimistic task + subtasks:** insert task with temp ID and pre-filled subtasks (also temp IDs) into `['tasks']` cache. Server responses rehydrate the real IDs one by one.

### 1.6 Integrity score tap — [integrity-logger.tsx:33-56](../../client/src/components/integrity-logger/integrity-logger.tsx#L33-L56)
- Cache key: `['workLogs', 'today']`.
- Optimistic: write the new WorkLog (or merge into existing) immediately; button reflects the tap without round-trip.
- `invalidateOnSettled`: `['weeklySummary']`.
- Also updates `useCreateWorkLog` / `useUpdateWorkLog` in [useWorkLogs.ts](../../client/src/hooks/useWorkLogs.ts).

### 1.7 Drag-drop task to calendar — [weekly-calendar-view.tsx:177-201,249-279](../../client/src/components/weekly-calendar-view/weekly-calendar-view.tsx#L177-L201)
- Uses `useUpdateTask` with a `scheduledCompleteDate` delta — leverages the 1.1 fix.
- Optimistic: update the task's `scheduledCompleteDate` in `['tasks']` cache inside `handleDrop`, `handleTouchEnd`, and `handleUnschedule` so the card snaps into the target column immediately, without waiting for refetch-driven re-sort.
- Keep drop-zone highlight state local (already optimistic).

### 1.8 Add subtask (inline) — [task-card.tsx:48-53](../../client/src/components/task-card/task-card.tsx#L48-L53)
- `useAddSubTask`: cache key `['tasks']`.
- Optimistic: append subtask with temp ID to parent task's `subTasks`. Recompute `canComplete` so the parent's complete button reflects the new subtask immediately.
- Input already clears instantly — keep that.
- `onServerSuccess`: swap the temp ID for the real server ID in the cache.

**Exit criteria for Phase 1:** every item above feels instant on a throttled network (simulate 500ms latency in DevTools). A failed request shows a rollback toast.

---

## Phase 2 — High-impact polish

### 2.1 Swipe task complete
Same hook as 1.1 — already fixed. Just verify swipe offset animation composes cleanly with the instant checkbox flip.

### 2.2 Delete subtask — [task-card.tsx:55-57](../../client/src/components/task-card/task-card.tsx#L55-L57)
- `useDeleteSubTask`: remove from array; undo toast.

### 2.3 Delete task
- `useDeleteTask`: remove from `['tasks']`; undo toast.

### 2.4 Delete / archive goal
- `useDeleteGoal`: remove from `['goals']`; undo toast.
- Detail-view navigates back immediately; toast shows in the goals list.

### 2.5 Log numeric goal progress
- Covered by 1.3 (`useLogGoalProgress`). Additionally close the form panel immediately.

---

## Phase 3 — Cross-cutting cleanup

### 3.1 Audit and remove redundant invalidations
For each converted mutation, the default `invalidateQueries(['tasks'])` becomes unnecessary — the cache is already correct. Keep only:
- `['weeklySummary']` after any action that affects it.
- `['goals', id]` when server re-computes streaks/aggregates.

### 3.2 Add retry for transient failures
Pass `retry: 1` with backoff to `useOptimisticMutation` defaults, so a flaky network doesn't cause visible rollbacks when a silent retry would succeed.

### 3.3 Undo button wiring for deletes (optional, behind a flag)
If the simple "show error toast on failure" approach is sufficient, skip. If users ask for explicit undo, implement: toast with action → re-POST the deleted record with its original data.

### 3.4 Loading-spinner cleanup
Several buttons show "Saving…" / "Adding…" text tied to `isPending`. Once the mutation is optimistic, the spinner becomes misleading — remove or replace with a quiet background indicator.

---

## Testing Strategy

- **Manual:** throttle Network to "Slow 3G" in DevTools. Every Phase 1 action must feel instant.
- **Unit:** for each converted hook, test `onMutate` cache mutation + `onError` rollback with a mocked `QueryClient`. Test files: `*.test.ts` under each hook.
- **Integration:** keep `.testenv` DB-hit test for the underlying API contract; optimistic logic is client-only so no backend changes.
- **Regression watch:** the main risk is cache drift — an optimistic update that doesn't match what the server returns. Phase 3.1 invalidation cleanup is the safety net.

## Rollout Order

1. Phase 0 (foundation) — one PR, no user-visible change.
2. Phase 1 — one PR per item, eight PRs total. Each is independently shippable.
3. Phase 2 — bundle as one PR (they share hooks changed in Phase 1).
4. Phase 3 — cleanup pass at the end.

## Out of Scope

- Backend changes (no schema or endpoint edits required).
- Modal/form flows (create/edit goal, edit task modal, edit goal log, add/edit expense, inline edit subtask text, submit weekly reflection, create recurring expense, save day integrity in closing event). These remain blocking today and can be picked up in a follow-up plan.
- Offline queue / service worker.
- Real-time multi-device sync.
- Undo history beyond the most recent delete.
