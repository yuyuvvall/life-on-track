# Edit & Delete Recurring Expenses — Plan

**Date:** 2026-05-13
**Goal:** Give the user a way to view, edit, pause/resume, and delete recurring expense templates. Today the templates can only be **created** (from `/expense/add`); after that they live silently in the DB and auto-generate expenses with no surface for managing them.

---

## What I learned from the code (audit)

### Backend — complete, nothing to add
`server/src/routes/recurringExpenses.ts` already exposes full CRUD plus generation:

| Endpoint | Status |
|---|---|
| `GET /recurring-expenses` | ✅ list (joins `categories.name`) |
| `POST /recurring-expenses` | ✅ create (validates amount, category, recurrenceType ∈ {weekly, monthly}, recurrenceDay range, optional `tagId`) |
| `PUT /recurring-expenses/:id` | ✅ update — dynamic, accepts `amount`, `category`, `note`, `recurrenceType`, `recurrenceDay`, `isActive`, `tagId` |
| `DELETE /recurring-expenses/:id` | ✅ delete (204 / 404) |
| `POST /recurring-expenses/generate` | ✅ idempotent per-day generator (uses `last_generated_date`) |

`isActive` (pause/resume) is already a column on `recurring_expenses` and is honored by `/generate` (line 338: `WHERE is_active = 1`). Currently no frontend surface ever flips it.

### Frontend API + hooks — already wired, mostly unused
`client/src/api/client.ts:207-230` exports `recurringExpensesApi` with `getAll`, `create`, `update`, `delete`, `generate`.

`client/src/hooks/useExpenses.ts:84-134` exports:
- `useRecurringExpenses` — **defined, zero call sites**
- `useCreateRecurringExpense` — used by `expense-quick-add.tsx`
- `useUpdateRecurringExpense` — **defined, zero call sites**
- `useDeleteRecurringExpense` — **defined, zero call sites**
- `useGenerateRecurringExpenses` — used by `expenses-view.tsx:69` (fires on mount)

All three unused hooks already invalidate `['recurringExpenses']` on success, so a UI dropped on top of them will just work.

`RecurringExpense` type at `client/src/types/index.ts:42-54` already includes `isActive`, `lastGeneratedDate`, `tagId`, `categoryId`.

### Frontend UI — the gap
- `client/src/views/expense-quick-add/expense-quick-add.tsx`
  - Line 93: `if (isRecurring && !isEditMode)` — creates a template only on *new* expense flow.
  - Line 172: `{!isEditMode && …}` — the "🔄 Recurring" pill is hidden in edit mode entirely.
  - The route is `/expense/add` (create) or `/expense/edit/:id` (edits an actual `expenses` row, NOT a recurring template).
- `client/src/views/expenses-view/expenses-view.tsx` — `/expenses`. Calls `useGenerateRecurringExpenses` on mount but renders **no list of templates** and no entry point to manage them.
- No route, no list view, no edit form, no delete button, no pause toggle exists for templates.

### Precedent for management modals
- `client/src/components/tag-manage-modal/tag-manage-modal.tsx` — full list/create/edit modal with archive toggle, opened from the "By Tag" tab's ⚙ button.
- `client/src/components/category-manage-modal/category-manage-modal.tsx` — same pattern.

Both modals: top-right ⚙ on the header → modal with list mode + create/edit mode + delete with confirm. This is the exact shape recurring management should take.

---

## Design decision

**Recommendation:** add a fourth ⚙-style entry point on `/expenses` for **Recurring**, opening a `RecurringExpensesModal` styled like `TagManageModal`.

**Why a modal, not a separate page:**
- Matches Tags / Categories precedent (consistency).
- Recurring is a *settings-ish* list, not a daily browse target — modal keeps `/expenses` the home for actual spending.
- Zero new routing, zero new layout work.

**Where the entry point lives:** as a small "🔄 Recurring" pill in `expenses-view__controls` (the row that has "By Category / Timeline / By Tag" toggle + the "+ Add" button at lines 395-424). Sits to the *left* of "+ Add". This puts it on every tab — recurring templates aren't tab-specific.

> *Alternative considered:* show a "Recurring" tab as a fourth `ViewMode`. **Rejected** — templates aren't expenses, they don't have a month, the "month nav" / "totals" header at the top would be meaningless above a template list. A modal scopes the UI cleanly.

---

## Principles

1. **Lean on existing hooks.** All three needed hooks (`useRecurringExpenses`, `useUpdateRecurringExpense`, `useDeleteRecurringExpense`) already exist and already invalidate the right query key.
2. **Reuse `RecurringOptionsModal` for the schedule picker.** It already does the weekly/monthly + day selection used at create time. The edit form can embed it.
3. **No backend changes.** PUT already accepts every field we need including `isActive`.
4. **Undo on delete**, consistent with `expenses-view.tsx:339-358` `handleDelete` (toast + undo via re-create).

---

## Phasing

One PR. All new files plus one entry-point edit in `expenses-view.tsx`.

| Step | Scope |
|---|---|
| 1 | New folder `client/src/components/recurring-manage-modal/` with `recurring-manage-modal.tsx` + `.less` + `index.ts` |
| 2 | List mode: render all templates with category icon, amount, schedule label, pause/active toggle, edit + delete buttons |
| 3 | Edit mode: amount keypad-or-input, category picker, note, schedule (reuse `RecurringOptionsModal`), optional tag picker |
| 4 | Delete with confirm + toast-undo |
| 5 | Wire a "🔄 Recurring" pill into `expenses-view.tsx`'s controls row, opens the modal |
| 6 | (Optional) Empty-state copy and a CTA "Create one from + Add" pointing to `/expense/add` |

---

## Step 1 — Component skeleton

**New folder:** `client/src/components/recurring-manage-modal/`

Files:
- `recurring-manage-modal.tsx`
- `recurring-manage-modal.less`
- `index.ts` (single-line re-export, matches `tag-manage-modal/index.ts`)

Component shape — mirror `TagManageModalProps`:

```ts
export type RecurringManageModalProps = {
  initialMode?: 'list' | 'edit';   // no 'create' — creation stays in /expense/add
  initialEditId?: number;
  onClose: () => void;
}
```

State (mirrors `tag-manage-modal.tsx:64-70`):
- `mode: 'list' | 'edit'`
- `editingId: number | undefined`
- `form: FormState` (amount, category, note, recurrenceType, recurrenceDay, tagId)
- `error: string | null`

Hooks used:
- `useRecurringExpenses()` — list
- `useUpdateRecurringExpense()` — save edits + pause/resume toggle
- `useDeleteRecurringExpense()` — delete
- `useCategories()` — for category picker
- `useTags(false)` — for optional tag picker (active tags only)

> No `useCreateRecurringExpense` — creation flow stays on `/expense/add` so the keypad + amount UX from quick-add isn't duplicated.

## Step 2 — List mode

For each `RecurringExpense` row, render a card with:

1. **Category icon** in a colored circle, identical visual to `expenses-view__expense-icon`.
2. **Title:** `formatCurrency(amount) + ' ' + category` (e.g. `₪450 Subscriptions`).
3. **Subtitle:** schedule label — reuse the same helper logic from `expense-quick-add.tsx:141-150`:
   - weekly → `Every ${WEEK_DAY_NAMES[recurrenceDay]}`
   - monthly → `Every month on the ${day}${ordinal}`
4. **Right cluster:**
   - Pause toggle (small switch) → `useUpdateRecurringExpense.mutate({ id, data: { isActive: !isActive } })`
   - "Edit" pencil → switches modal to `edit` mode with `editingId` set
   - "Delete" × → confirm + delete (Step 4)
5. **Dim the whole row when `!isActive`** with `opacity: 0.55` and add a small `Paused` badge.
6. **`note`** rendered as a small line under the subtitle when present.
7. **`tagId`** → if set and the tag is found, show the tag chip (reuse the same chip used in `expenses-view.tsx:506-522`).

Empty state: `"No recurring expenses yet. Add one from the + Add screen — toggle the 🔄 pill before saving."`

Sort: `isActive DESC, createdAt DESC` (active ones first).

## Step 3 — Edit mode

A single form, no keypad (this is a settings flow, not a quick-entry one). Fields:

- **Amount** — `<input type="number" step="0.01" min="0">` prefixed with `CURRENCY_SYMBOL`.
- **Category** — horizontal scroll of category circles, identical pattern to `expense-quick-add.tsx:195-223`. Extract into a small `<CategoryPickerRow>` later if duplication grows; **for this PR, inline copy** to avoid scope creep.
- **Note** — plain text input.
- **Schedule** — a row showing the current schedule label + an `Edit` button that opens `<RecurringOptionsModal>` (reuse `client/src/views/expense-quick-add/recurring-options-modal.tsx` as-is). The modal's `onTurnOff` is unreachable here (you can't turn a recurring template into a non-recurring one), so wire `onTurnOff` to a no-op or simply hide the "Off" button via a new optional prop. **Choice: add `hideOffOption?: boolean` prop** to `RecurringOptionsModal` — one-line change.
- **Tag** — reuse the `<TagChipRow mode="prefill">` pattern from `expense-quick-add.tsx:225-238` for parity. Selecting `null` clears.

**Save** button → `useUpdateRecurringExpense.mutate({ id: editingId, data })` with all fields (the backend's `PUT` is dynamic so sending all is fine). On success → `setMode('list')` and show a toast `Recurring expense updated`.

**Cancel** → `setMode('list')`, no save.

**Back arrow / header** matches `TagManageModal`'s edit header.

## Step 4 — Delete with confirm + undo

Two-step in-row delete to avoid a separate confirm modal (consistent with how budgets / expenses are deleted): first tap reveals a confirm pill `Tap again to delete`, second tap calls `useDeleteRecurringExpense.mutate(id)`.

On delete, show a 5-second toast with Undo action that re-POSTs via `useCreateRecurringExpense` using the deleted row's fields (note: this will produce a new `id`, identical to how `expenses-view.tsx:339-358` does undo for expenses). Acceptable because the template is functionally identical.

## Step 5 — Entry point on /expenses

**File:** `client/src/views/expenses-view/expenses-view.tsx`

1. Import `RecurringManageModal` from `@/components`.
2. Add `const [showRecurringManager, setShowRecurringManager] = useState(false)`.
3. In the `expenses-view__controls` row (lines 395-424), insert a new pill button *to the left of* the "+ Add" button:

   ```tsx
   <button
     onClick={() => setShowRecurringManager(true)}
     className="expenses-view__recurring-btn"
     aria-label="Manage recurring expenses"
     title="Recurring"
   >
     <span aria-hidden>🔄</span>
     <span>Recurring</span>
   </button>
   ```

4. Render the modal at the bottom of the JSX next to the other modals:

   ```tsx
   {showRecurringManager && (
     <RecurringManageModal onClose={() => setShowRecurringManager(false)} />
   )}
   ```

5. Add `.expenses-view__recurring-btn` style in `expenses-view.less` mirroring `.expenses-view__add-btn` but with a muted background (so "+ Add" stays the dominant CTA).

6. Export `RecurringManageModal` from `client/src/components/index.ts` (the barrel — check it exists; if not, add it).

## Step 6 — Tests

Add `recurring-manage-modal.test.tsx` mirroring `tag-manage-modal.test.tsx`:

- Renders list of templates
- Pause toggle calls `useUpdateRecurringExpense` with `{ isActive: false }`
- Edit flow → save calls update with full payload
- Delete flow → confirm pill → delete called → undo toast restores via create

Backend already has whatever route tests exist; no new server tests needed.

---

## Files touched

**New:**
- `client/src/components/recurring-manage-modal/recurring-manage-modal.tsx`
- `client/src/components/recurring-manage-modal/recurring-manage-modal.less`
- `client/src/components/recurring-manage-modal/index.ts`
- `client/src/components/recurring-manage-modal/recurring-manage-modal.test.tsx`

**Edited:**
- `client/src/views/expenses-view/expenses-view.tsx` — entry-point button + modal mount
- `client/src/views/expenses-view/expenses-view.less` — `.expenses-view__recurring-btn` style
- `client/src/views/expense-quick-add/recurring-options-modal.tsx` — add `hideOffOption?: boolean` prop
- `client/src/components/index.ts` — re-export (if barrel exists)

**Untouched (intentionally):**
- All server code — backend is already complete.
- `expense-quick-add.tsx` — creation flow stays as-is.
- DB schema / migrations — no changes needed.

---

## Out of scope

- A dedicated "next run date" calculation for the list. Backend stores only `last_generated_date`; computing the next due date from `recurrenceType` + `recurrenceDay` is trivial but adds UI bloat. Defer until requested.
- Bulk pause / archive of all templates.
- Skipping a single occurrence (`/generate` is fully automatic; no "skip this month" concept exists).
- Variable amounts (e.g. averaging a fluctuating bill). Templates remain fixed-amount.
