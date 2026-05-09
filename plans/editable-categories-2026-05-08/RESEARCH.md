# Editable Expense Categories — Research

**Date:** 2026-05-08
**Author:** Claude (Opus 4.7)

This document captures the current state of expense categories across the stack, the constraints any plan must respect, and the decisions that flow from those findings.

---

## 1. Backend: categories are free-form strings

There is **no `categories` table**. The string `category` is stored directly on every entity that "has a category":

| Table | Column | File reference |
|---|---|---|
| `expenses` | `category TEXT NOT NULL` | `server/src/db/index.ts:97-103` |
| `recurring_expenses` | `category TEXT NOT NULL` | `server/src/db/index.ts:106-116` |
| `category_budgets` | `category TEXT NOT NULL` (UNIQUE with month) | `server/src/db/index.ts:119-126` |
| `expense_tags` | `category TEXT NOT NULL` | `server/src/db/index.ts:129-140` |

**Type-side:** `ExpenseRow.category: string` — `server/src/types.ts:33`. No enum, no FK, no validation.

**API surface (expenses):** `server/src/routes/expenses.ts`
- `GET /expenses` — list, optional `start` / `end` date filters. **No `category` filter.**
- `GET /expenses/:id`, `POST /expenses`, `PUT /expenses/:id` (line 217), `DELETE /expenses/:id`.

**Other consumers:**
- Weekly summary groups expenses by category at runtime (`server/src/routes/weekly.ts:53-60`).
- Budgets API stores arbitrary category strings keyed by `(category, month)` (`server/src/routes/budgets.ts:86`).

## 2. Frontend: categories are hard-coded in 4 places

The same eight-item list (with subtle drift) appears in:

| File | Lines | What it stores |
|---|---|---|
| `client/src/views/expense-quick-add/expense-quick-add.tsx` | 13-22 | `id`, `icon`, `color` (8 items) |
| `client/src/views/expenses-view/expenses-view.tsx` | 22-31 | `CATEGORY_ICONS` (8 items) |
| `client/src/views/expenses-view/expenses-view.tsx` | 33-42 | `CATEGORY_MODIFIER` for BEM CSS classes |
| `client/src/components/tag-manage-modal/tag-manage-modal.tsx` | 6-15 | duplicate of quick-add list |
| `client/src/types/index.ts` | 259-269 | `EXPENSE_CATEGORIES` + `ExpenseCategory` type — **missing "Groceries"** ⚠ |

**Canonical seed list** (from `expense-quick-add.tsx`):

| name | icon | color |
|---|---|---|
| Food | 🍴 | #f97316 |
| Groceries | 🛒 | #3b82f6 |
| Transport | 🚌 | #f59e0b |
| Shopping | 🛍️ | #ec4899 |
| Bills | 📄 | #64748b |
| Entertainment | 🎮 | #a855f7 |
| Health | 💊 | #10b981 |
| Other | 📦 | #6b7280 |

**By Category view:** `client/src/views/expenses-view/expenses-view.tsx:372-491`. Each card shows icon, name, total, count, %, tag breakdown, budget progress. **The card itself has no click handler.** Only the budget line is clickable (opens `BudgetEditModal`).

**Timeline view:** same file, lines 317-370. Expenses grouped by date. No category filter.

**Add Expense:** `expense-quick-add.tsx:198-226`. Horizontal scroll of icon buttons.

**No category-management UI exists** anywhere in the app.

## 3. Existing pattern to mirror: `expense_tags`

The recently shipped tags feature (`plans/expense-tags-2026-05-07/PLAN.md`) gives us the template:
- Soft-delete via `is_archived` so historical expenses keep their reference.
- Nullable FK column added by `ALTER TABLE` in `initDb()`'s try/catch migration block.
- Reusable `useOptimisticMutation`, `showToast`, `request<T>()`, `<TagManageModal>`.
- "Snapshot, not live link" for tags — but the linked id is the source of truth for filtering.

We will follow the same pattern for categories. The architectural question (snapshot vs. live) is settled differently: **for categories, the live link wins**. Renaming "Food" → "Dining" should retroactively rename it everywhere; that is the user-visible value of making categories editable. Storing only `category_id` and joining at render time achieves this with zero migration churn on rename.

## 4. Constraints any plan must respect

1. **Four denormalized columns to reconcile.** Expenses, recurring_expenses, category_budgets, expense_tags all carry the string. A migration must touch all four — partial coverage will leak old strings into new queries.
2. **`category_budgets` has a UNIQUE(category, month) constraint.** Switching to `category_id` requires rebuilding that constraint as `UNIQUE(category_id, month)`.
3. **No backend test harness.** Verification is manual (`curl` / Swagger), per the tags plan.
4. **The `EXPENSE_CATEGORIES` type drift** ("Groceries" missing from `types/index.ts:259-269`) means at least one consumer of that type may be silently broken today. Worth grepping during cleanup.
5. **Phase 2 (drill-down)** needs a filter mechanism on `GET /expenses` — currently there is none, but adding `?categoryId=` to the existing route is trivial.

## 5. Design decisions

| Decision | Choice | Why |
|---|---|---|
| New table? | Yes — `categories(id, name UNIQUE, icon, color, sort_order, is_archived, created_at)` | Need a single source of truth for icon/color/order; matches `expense_tags` shape. |
| FK or string? | **FK (`category_id`)** as live link; drop the legacy `category` text column after migration. | Makes rename trivial and universal — the headline user-visible feature. |
| Soft-delete? | Yes — `is_archived` flag, mirroring `expense_tags`. | Past expenses keep a valid FK; archived categories disappear from pickers. |
| Migration | One-shot script in `initDb()` migration block: seed defaults, then map each existing `category` string to a category id (case-insensitive); auto-create rows for any unknown strings. | Idempotent; safe to re-run; preserves data. |
| Filter API | Add `?categoryId=` to `GET /expenses`. | Smallest surface for Phase 2 drill-down; the existing date filters set the precedent. |
| Frontend cleanup | Delete all 4 hard-coded constants; introduce a single `useCategories()` hook backed by TanStack Query. | Removes the drift between `EXPENSE_CATEGORIES` and the quick-add list. |
| Management UI | New `<CategoryManageModal>` modeled on `<TagManageModal>`. | Pattern reuse; nothing new to learn. |
| BEM modifier classes | Replace `.expenses-view__expense-card--food` etc. with inline `style={{ borderColor: cat.color }}` (or a CSS variable). | Hard-coded modifiers can't survive user-editable category names; switch to data-driven styling. |
