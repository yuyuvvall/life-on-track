# Mobile fit — Add Expense screen — 2026-05-08

## Goal
Make the Add/Edit Expense screen fit a phone viewport with **no vertical scroll**. Tighten oversized icons and the page title. Mobile only — desktop unchanged.

## Decisions (from brainstorm)
- **Drop** the redundant "Category" banner (selected category is already highlighted in the scroll row).
- **Keep** the date footer (it doubles as the recurring-schedule label).
- **Categories** → single horizontal-scroll row with smaller circles (~2.25em).
- **Recurring toggle** → compact pill in the header (replaces full-width row + Change-schedule link).
- **Scope** → `@media (max-width: 480px)` only.
- **Strict no-scroll** → `height: 100dvh; overflow: hidden;` on the root, with `flex: 1 1 0; min-height: 0;` on the amount section so it absorbs leftover space.

## File changes

### `client/src/views/expense-quick-add/expense-quick-add.tsx`
1. **Header**: add a "recurring pill" button next to the date button. Show only when `!isEditMode`. Pill label:
   - off → `🔄 One-time`
   - on  → `🔄 {Weekly | Monthly}` (short form of current schedule)
   - Tap pill → opens `RecurringOptionsModal`.
2. **Remove** the `expense-quick-add__banner` block (the blue Category banner).
3. **Remove** the `expense-quick-add__recurring-toggle` block (full-width toggle row).
4. Date button visibility logic stays the same (hidden when `!isEditMode && isRecurring`).

### `client/src/views/expense-quick-add/recurring-options-modal.tsx`
- Add an "Off" segment to the type group → `[Off | Weekly | Monthly]`. Selecting Off + Save calls `onSave('off', 0)` (or a new `onTurnOff` callback) to disable recurring. This is the only way to turn it off in the new UX.
- Pass `isRecurring` in so the initial selected segment reflects current state.

### `client/src/views/expense-quick-add/expense-quick-add.less`
- Add a single `@media (max-width: 480px)` block at the bottom that overrides:
  - root: `height: 100dvh; overflow: hidden;`
  - header padding tightened, `__page-title` font-size to 1em
  - `__categories`: `flex-shrink: 0;` and tighter padding
  - `__category-scroll`: `flex-wrap: nowrap;`
  - `__category-circle`: 2.25em, font-size 1.1em
  - `__category-label`: 0.7em
  - `__amount-section`: `flex: 1 1 0; min-height: 0;`
  - `__amount-display`: 2.25em (down from 3em)
  - `__notes-input`: tighter margin/padding
  - `__keypad`, `__date-footer`: `flex-shrink: 0;`
  - new `__recurring-pill` styles (small rounded pill, accent-blue when on, muted when off)

### `client/src/views/expense-quick-add/keypad-button.less`
- Inside the same media query: `height: 2.75em; font-size: 1.1em;`

### `client/src/components/tag-chip-row/tag-chip-row.less`
- Inside the same media query: `padding: @space-1 @space-3; flex-shrink: 0;`

## Verification
- Resize devtools to 375×667 (iPhone SE) and 390×844 (iPhone 14): no vertical scrollbar, all sections visible, keypad reachable.
- Selecting categories still works; tag chip prefill still works.
- Recurring pill: off → tap → modal → choose Monthly + day → save → pill shows "🔄 Monthly", footer shows "Every month on the Nth".
- Recurring pill: on → tap → modal with Off preselected option → choose Off + Save → pill returns to "🔄 One-time".
- Desktop view (≥481px) unchanged.
