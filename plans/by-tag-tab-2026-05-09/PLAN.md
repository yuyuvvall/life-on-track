# By Tag tab on /expenses — Plan

**Date:** 2026-05-09
**Goal:** Add a third **By Tag** tab to the `/expenses` view that mirrors the structure of **By Category** — a list of cards showing per-tag total + count + share-of-wallet — but without budgets. Tab order becomes **By Category · Timeline · By Tag**.

---

## What I learned from the code (quick audit)

- **View state lives in one component:** `client/src/views/expenses-view/expenses-view.tsx`. There's no separate sub-component per tab — each view mode is rendered inline in the same file.
- **`ViewMode` is a type union** at line 26: `type ViewMode = 'timeline' | 'category'`. Two toggle buttons at lines 307-321. Default is `'category'` (recently flipped).
- **Tag data is already loaded.** Line 74: `const { data: allTags = [] } = useTags(true)` and a `tagsById` Map at lines 76-80. We don't need any new hooks or API calls.
- **The category breakdown** (lines 201-222) is computed from `expenses` (and surfaces budgeted-but-empty categories). The By Tag breakdown only needs `expenses` (no equivalent of a "budget that surfaces empty rows").
- **A tag-by-category breakdown already exists** (lines 224-245, `tagBreakdownByCategory`) but it's nested under each category. We want a *flat* breakdown across all categories.
- **Drill-down precedent:** clicking a category card calls `handleSelectCategoryFilter(id)` → sets `?category={id}` URL param + switches to timeline. The timeline filter at lines 170-173 reads `expense.categoryId === categoryFilter`. The filter chip at lines 332-350 shows the active filter with a ✕.
- **Card styling is data-driven.** The `--cat-color` CSS variable on `.expenses-view__category-card` drives the icon background and the progress fill (lines 415, 508, 517). Tags carry their own `icon` + `color` (curated palette, set in `<TagManageModal>`), so reusing the same card visuals for tags is a one-line CSS-variable swap.
- **Only `category_budgets` keeps a `category` text column** (Phase 4 cleanup). All other expense columns are `category_id`. Tags have no budget concept anywhere — confirms the "no budgets" requirement.
- **No backend work is required.** Tags are already on `Expense.tagId`. No new endpoints, no schema changes.

## Principles (carried over from prior phases)

1. **Reuse what works.** The By Category card is already data-driven via `--cat-color` and renders icon/name/amount/count/%. The tag card uses identical structure with the tag's color and icon.
2. **Drill-down parity.** Tapping a tag card mirrors tapping a category card: switch to Timeline filtered to that tag, show a removable filter chip. Toggle tabs clear the filter.
3. **No backend churn.** All data is already in the client cache via `useTags` + `useExpensesByDateRange`.

---

## Phasing

One PR. The change is contained to `expenses-view.tsx` + `expenses-view.less`.

| Step | Scope |
|---|---|
| 1 | Type + toggle: extend `ViewMode` with `'tag'`, add the third toggle button in the right order. |
| 2 | Filter plumbing: support `?tag=:id` URL param symmetric to `?category=:id`. |
| 3 | Compute `tagBreakdown` from `expenses`. |
| 4 | Render the By Tag list (cards reuse `__category-card` classes via `--cat-color` set from the tag color). |
| 5 | Drill-down: tag-card click → timeline filtered by `tag`. Filter chip shows the active tag. |
| 6 | Empty-state and edge cases (no tagged expenses; archived tag still referenced by an old expense). |

---

## Step 1 — Toggle: three tabs in the right order

**File:** `expenses-view.tsx`

- [ ] Extend `ViewMode` at line 26: `type ViewMode = 'category' | 'timeline' | 'tag'`.
- [ ] In the `<div className="expenses-view__toggle">` block (lines 308-321), reorder + add a third button. Final order:
  - **By Category** (active when `viewMode === 'category'`)
  - **Timeline** (active when `viewMode === 'timeline'`)
  - **By Tag** (active when `viewMode === 'tag'`)
  - Each button calls `handleClearCategoryFilter()` + `handleClearTagFilter()` (new — see Step 2) so that switching tabs always returns to the unfiltered view, identical to today's behavior. *Exception:* clicking the active tab does nothing extra.

> **Default tab stays `'category'`.** The just-shipped default is correct; we don't change it.

## Step 2 — `?tag=:id` URL param

**File:** `expenses-view.tsx`

Mirror the existing `categoryFilter` plumbing (lines 42-46, 92-114). Insert next to it:

- [ ] `tagFilterParam = searchParams.get('tag')`, `tagFilter: number | null` derived via the same `Number.isInteger(n) && n > 0` guard.
- [ ] `filteredTag: Tag | null` — looked up from `tagsById`.
- [ ] An effect that drops a stale tag filter when the tags load and the id is gone, mirroring the existing category cleanup at lines 94-102.
- [ ] `handleSelectTagFilter(id: number)` — sets `?tag={id}` and `setViewMode('timeline')`.
- [ ] `handleClearTagFilter()` — deletes `tag` from search params.

> **Mutual exclusion.** When setting one filter (category OR tag), clear the other. Two filters at once would compose as AND, but the breakdown views aren't designed for that and the chip row would get noisy. Single filter at a time keeps the UX simple.

Update `timelineExpenses` (lines 170-173) to apply both filters:

```ts
const timelineExpenses = useMemo(() => {
  let out = expenses
  if (categoryFilter !== null) out = out.filter((e) => e.categoryId === categoryFilter)
  if (tagFilter !== null)     out = out.filter((e) => e.tagId === tagFilter)
  return out
}, [expenses, categoryFilter, tagFilter])
```

## Step 3 — `tagBreakdown` memo

**File:** `expenses-view.tsx`, alongside `categoryBreakdown` (lines 201-222).

```ts
const tagBreakdown = useMemo(() => {
  const accum = new Map<number, { total: number; count: number }>()
  let untaggedTotal = 0
  let untaggedCount = 0
  for (const e of expenses) {
    if (e.tagId === null) {
      untaggedTotal += e.amount
      untaggedCount += 1
      continue
    }
    const prev = accum.get(e.tagId) ?? { total: 0, count: 0 }
    accum.set(e.tagId, { total: prev.total + e.amount, count: prev.count + 1 })
  }
  const rows: Array<{ tag: Tag | null; total: number; count: number }> = []
  for (const [tagId, stats] of accum) {
    const tag = tagsById.get(tagId)
    if (!tag) continue // tag was hard-deleted (shouldn't happen — soft-delete only — but defensive)
    rows.push({ tag, total: stats.total, count: stats.count })
  }
  rows.sort((a, b) => b.total - a.total)
  if (untaggedCount > 0) {
    rows.push({ tag: null, total: untaggedTotal, count: untaggedCount })
  }
  return rows
}, [expenses, tagsById])
```

> **Untagged bucket** is appended at the end as a single row with `tag: null`, rendered with a neutral icon ("—" or 📦) and gray color. Without it, the % share is misleading whenever a meaningful chunk of expenses isn't tagged. **See Open question 1** below.

> **Archived tags** that still have expenses this month show up by default since `useTags(true)` is loaded. The card renders the (archived) tag's icon/color/name without any "archived" indicator — matches how the timeline shows the same expenses today.

## Step 4 — Render the By Tag list

**File:** `expenses-view.tsx`, in the rendering block currently at lines 424-566.

Add a third branch after the existing `viewMode === 'timeline'` and the implicit `else` (which is `category`). The cleanest shape:

```tsx
viewMode === 'timeline' ? (
  /* timeline (unchanged) */
) : viewMode === 'category' ? (
  /* category breakdown (unchanged) */
) : (
  /* tag breakdown — new */
)
```

Each card uses **the same `expenses-view__category-card` / `__category-header` / `__category-icon` / `__category-info` / `__category-row` / `__progress-track` / `__progress-fill` classes**. Set `--cat-color` to `tag.color` (or `#6b7280` for the Untagged bucket). The progress bar uses `shareOfWallet` as its fill (no budget overlay — the `__progress-budget` element is omitted).

What to **drop** vs. the category card:
- ❌ No `__category-tags` inner chip row.
- ❌ No `__progress-budget` overlay.
- ❌ No `__budget-line` button.
- ❌ No "Edit budgets" / ⚙ "Manage categories" buttons in the header.

What to **add/change**:
- The card header is a `<button>` like the category one — `onClick = () => handleSelectTagFilter(tag.id)`. Untagged is rendered as a non-clickable card (or a button that filters to "expenses with no tag" — see Open question 2).

The header layout matches the By Category card exactly — icon + name on the left, amount on the right, count + % on the second line. Re-read of `expenses-view.tsx:471-499` is the template.

The header bar above the cards mirrors `__categories-header`:

```tsx
<div className="expenses-view__categories-header">
  <span className="expenses-view__categories-title">
    {tagBreakdown.length > 0 ? 'Tags' : `No tagged expenses ${isCurrentMonth ? 'this month' : `in ${monthName}`}`}
  </span>
  {/* No actions button on the right for v1. See Open question 3. */}
</div>
```

End-of-list summary (parity with `__category-summary`):

```tsx
<div className="expenses-view__category-summary">
  {tagBreakdown.length} tag{tagBreakdown.length === 1 ? '' : 's'} {isCurrentMonth ? 'this month' : `in ${monthName}`}
</div>
```

> **No new LESS classes.** The existing `__category-*` classes do exactly the right thing once `--cat-color` is set from the tag color. Naming is slightly awkward ("category" classes used for tags), but renaming to a neutral `__breakdown-*` is a separate refactor that touches both views and is out of scope.

## Step 5 — Filter chip + drill-down

**File:** `expenses-view.tsx` at lines 332-350.

- [ ] Extend the `filter-chip-row` block to render either chip (category or tag), not just category. Pseudocode:

```tsx
{viewMode === 'timeline' && (filteredCategory || filteredTag) && (
  <div className="expenses-view__filter-chip-row">
    {filteredCategory && /* existing category chip */ }
    {filteredTag && (
      <button
        type="button"
        className="expenses-view__filter-chip"
        onClick={handleClearTagFilter}
        style={{ borderColor: filteredTag.color }}
      >
        <span className="expenses-view__filter-chip-icon" style={{ backgroundColor: filteredTag.color }}>
          {filteredTag.icon}
        </span>
        <span className="expenses-view__filter-chip-name">{filteredTag.name}</span>
        <span className="expenses-view__filter-chip-close" aria-hidden>×</span>
      </button>
    )}
  </div>
)}
```

Mutual exclusion (Step 2) means at most one chip will show at a time, but the JSX handles both for simplicity.

## Step 6 — Empty state + edge cases

- [ ] `expenses.length === 0` while in tag mode: reuse the existing `__empty` block. Today's check at line 357 is `expenses.length === 0 && !(viewMode === 'category')` — extend to `viewMode === 'timeline'` only, so both breakdown modes show their own "no rows" headers instead of the generic empty state. Easier: change the condition to `viewMode === 'timeline'`.
- [ ] No tagged expenses but there *are* untagged ones: the breakdown will contain just the Untagged card. Expected.
- [ ] No tags at all in the system (system has no tags): show the breakdown header's empty message + the end-of-list summary. The Untagged card still appears if relevant.
- [ ] An archived tag still has expenses this month: card renders normally (no "archived" badge in v1).

---

## Open questions (please confirm before implementation)

1. **Untagged bucket — include?**
   - **Recommend yes.** Without it, the "% of wallet" numbers are confusing whenever many expenses are untagged. Renders as a single neutral-gray card with icon "—" and the label "Untagged."
   - Alternative: omit; users see only tagged spend. Cleaner but the % math doesn't add to 100.

2. **Drill-down on the Untagged card — clickable?**
   - **Recommend yes** — clicking opens the timeline filtered to "expenses with no tag." Implementation: `handleSelectTagFilter(0)` (sentinel) or a separate `?tag=none` URL param. Slight extra plumbing.
   - Alternative: render Untagged as a non-clickable card. Simpler. User loses the "show me what hasn't been tagged" affordance.

3. **Manage Tags ⚙ button on the By Tag header — add now?**
   - **Recommend deferring.** Tags can already be managed from `<TagChipRow>` and the "Save as tag" flow on `/expense/add`. Adding a ⚙ on the header is symmetrical with By Category but is polish, not core. Easy follow-up.

## Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| The reused `__category-*` class names confuse a future reader who finds them used for tags | Medium | Add a one-line comment in the JSX where the tag breakdown reuses them. Plan a future rename to `__breakdown-*`. |
| Untagged bucket math drifts when archived tags still have expenses | Low | Defensive `if (!tag) continue` already in the memo prevents the breakdown from blowing up; expense count just doesn't aggregate to that ghost tag. |
| URL filter cleanup (`?tag=` becomes stale after a tag is hard-deleted) | Low | Soft-delete only is the contract for tags. The cleanup effect in Step 2 handles it anyway. |
| Naming collision: `Tag` type and the `'tag'` view mode literal | None | TypeScript's `ViewMode = 'category' \| 'timeline' \| 'tag'` is a string literal, not a type clash. |

## Files touched

- `client/src/views/expenses-view/expenses-view.tsx` — **the only file changed** (plus possibly a tiny tweak in `expenses-view.less` if we want the Untagged card to dim slightly; not necessary for v1).

No backend changes. No new components. No new hooks.

## Estimated size

~80–120 lines added, ~10 lines reordered. Single PR.
