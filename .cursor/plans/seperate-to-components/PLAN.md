# Plan: Separate Multi-Component Files Into Individual Files

## Goal

Extract all internal/helper components that live alongside the main component in a single `.tsx` file into their own dedicated files, following the ui-development skill conventions.

---

## Conventions (from `/ui-development` skill)

- **File naming:** kebab-case; sub-components live in the same folder as the main component and are named by their own identity (e.g., `keypad-button.tsx`, not `expense-quick-add-keypad-button.tsx`)
- **Each sub-component** gets its own `.tsx` file + a matching `.less` file
- **Props type** exported from every component file: `export type XxxProps = { ... }`
- **Arrow function** with `export default`
- **Barrel `index.ts`** only re-exports the main component + its Props type (sub-components stay internal)
- **LESS + BEM:** block name matches component file name in kebab-case

> **Note:** The "fully controlled / no useState" rule from the skill applies to reusable **ui-kit** components. These are **view-level** components that naturally own state (hooks, mutations, etc.) — they keep their existing state management.

---

## File 1: `expense-quick-add/expense-quick-add.tsx`

**Current state:** 4 components in one 590-line file.

### 1a. Extract `KeypadButton` → `keypad-button.tsx`

| Detail | Value |
|--------|-------|
| Current location | Line 25 |
| Scope | Internal presentational button |
| Has own BEM block? | No — uses parent's `.expense-quick-add__key` classes |
| Has state? | No — pure presentational |
| Props | `label: string`, `onClick: () => void`, `disabled?: boolean`, `variant?: 'default' \| 'operator' \| 'delete' \| 'calendar'` |

**Steps:**
1. Create `keypad-button.tsx`
   - Define and export `KeypadButtonProps` type
   - Move the component as a `const` arrow function with `export default`
   - Import the sub-component's own LESS file
2. Create `keypad-button.less`
   - Extract the `&__key` and all its modifier styles (`--operator`, `--delete`, `--calendar`) from `expense-quick-add.less`
   - Rename BEM block from `.expense-quick-add__key` to `.keypad-button` with element/modifier variants (`&--operator`, `&--delete`, `&--calendar`, `&:hover`, `&:active`, `&:disabled`)
3. Update class names in the new `.tsx` to use the new BEM block
4. In `expense-quick-add.tsx`: replace inline `KeypadButton` definition with `import KeypadButton from './keypad-button'`

### 1b. Extract `RecurringOptionsModal` → `recurring-options-modal.tsx`

| Detail | Value |
|--------|-------|
| Current location | Line 48 |
| Scope | Modal for recurring expense schedule config |
| Has own BEM block? | **Yes** — `.recurring-options-modal` (already self-contained) |
| Has state? | Yes — `tempType`, `tempDay` (local temp values before save) |
| Props | `recurrenceType: RecurrenceType`, `recurrenceDay: number`, `onSave: (type, day) => void`, `onCancel: () => void` |
| Dependencies | `WEEK_DAY_NAMES` from `@/utils/dateConstants`, `RecurrenceType` from `@/types` |

**Steps:**
1. Create `recurring-options-modal.tsx`
   - Define and export `RecurringOptionsModalProps` type
   - Move the entire `RecurringOptionsModal` component as the default export
   - Add imports: `useState` from react, `WEEK_DAY_NAMES`, `RecurrenceType`
   - Import its own LESS file
2. Create `recurring-options-modal.less`
   - Move the entire `.recurring-options-modal { ... }` block (lines 410–549) out of `expense-quick-add.less`
   - Add `@import '../../styles/variables.less';` at the top
3. In `expense-quick-add.tsx`: replace inline definition with `import RecurringOptionsModal from './recurring-options-modal'`

### 1c. Extract `DatePickerModal` → `date-picker-modal.tsx`

| Detail | Value |
|--------|-------|
| Current location | Line 146 |
| Scope | Calendar modal for date selection |
| Has own BEM block? | **Yes** — `.date-picker-modal` (already self-contained) |
| Has state? | Yes — `viewDate`, `tempDate` (navigation + selection before confirm) |
| Props | `selectedDate: Date`, `onSelect: (date: Date) => void`, `onCancel: () => void` |
| Dependencies | `WEEK_DAY_NAMES` from `@/utils/dateConstants` |

**Steps:**
1. Create `date-picker-modal.tsx`
   - Define and export `DatePickerModalProps` type
   - Move the entire `DatePickerModal` component as the default export
   - Add imports: `useState` from react, `WEEK_DAY_NAMES`
   - Import its own LESS file
2. Create `date-picker-modal.less`
   - Move the entire `.date-picker-modal { ... }` block (lines 555–738) + the `@keyframes expense-spin` (lines 741-744) out of `expense-quick-add.less`
   - Add `@import '../../styles/variables.less';` at the top
3. In `expense-quick-add.tsx`: replace inline definition with `import DatePickerModal from './date-picker-modal'`

### 1d. What remains in `expense-quick-add.tsx`

After extraction, the main file should contain:
- Imports (react, router, hooks, types, and the 3 new sub-components)
- `CATEGORIES` constant + `CategoryId` type
- `ExpenseQuickAdd` component (the main default export, ~300 lines)

The `expense-quick-add.less` file should only contain the `.expense-quick-add { ... }` block (lines 1–404), minus the extracted `&__key` styles.

### Final file structure

```
expense-quick-add/
├── expense-quick-add.tsx              # main (imports sub-components)
├── expense-quick-add.less             # main styles only
├── keypad-button.tsx                  # KeypadButton sub-component
├── keypad-button.less                 # keypad button styles
├── recurring-options-modal.tsx        # RecurringOptionsModal sub-component
├── recurring-options-modal.less       # recurring modal styles
├── date-picker-modal.tsx              # DatePickerModal sub-component
├── date-picker-modal.less             # date picker modal styles
└── index.ts                           # barrel (no changes needed)
```

---

## File 2: `goal-detail-view/goal-detail-view.tsx`

**Current state:** 2 components in one 755-line file.

### 2a. Extract `GoalLogEditModal` → `goal-log-edit-modal.tsx`

| Detail | Value |
|--------|-------|
| Current location | Line 8 |
| Scope | Modal for editing an existing goal log entry |
| Has own BEM block? | **Yes** — `.goal-log-edit-modal` (already self-contained) |
| Has state? | Yes — `value`, `note`, `logDate` (form fields) |
| Props | `log: GoalLog`, `goal: Goal`, `onClose: () => void` |
| Dependencies | `useState` from react, `useUpdateGoalLog` from `@/hooks`, `Goal` + `GoalLog` from `@/types` |

**Steps:**
1. Create `goal-log-edit-modal.tsx`
   - Define and export `GoalLogEditModalProps` type:
     ```typescript
     export type GoalLogEditModalProps = {
       log: GoalLog
       goal: Goal
       onClose: () => void
     }
     ```
   - Move the entire `GoalLogEditModal` component (lines 8–138) as the default export
   - Add imports: `useState`, `useUpdateGoalLog`, `Goal`, `GoalLog`
   - Import its own LESS file
2. Create `goal-log-edit-modal.less`
   - Move the entire `.goal-log-edit-modal { ... }` block (lines 652–739 of goal-detail-view.less) into this new file
   - Add `@import '../../styles/variables.less';` at the top
3. Remove the `.goal-log-edit-modal` block from `goal-detail-view.less`
4. In `goal-detail-view.tsx`: replace inline definition with `import GoalLogEditModal from './goal-log-edit-modal'`

### What remains in `goal-detail-view.tsx`

After extraction:
- Imports (react, router, hooks, types, GoalFormModal, and the new `GoalLogEditModal`)
- `GoalDetailView` component (~610 lines)

### Final file structure

```
goal-detail-view/
├── goal-detail-view.tsx               # main (imports sub-component)
├── goal-detail-view.less              # main styles only
├── goal-log-edit-modal.tsx            # GoalLogEditModal sub-component
├── goal-log-edit-modal.less           # log edit modal styles
└── index.ts                           # barrel (no changes needed)
```

---

## File 3: `goals-summary-view/goals-summary-view.tsx`

**Current state:** 2 components in one 147-line file.

### 3a. Extract `GoalSection` → `goal-section.tsx`

| Detail | Value |
|--------|-------|
| Current location | Line 131 |
| Scope | Presentational section that groups goals by type |
| Has own BEM block? | **No** — uses parent's `.goals-summary-view__section-*` classes |
| Has state? | No — pure presentational |
| Props (already typed) | `title: string`, `icon: string`, `goals: Goal[]`, `onDelete: (id: string) => void` |
| Dependencies | `GoalCard` from `@/components/goal-card`, `Goal` from `@/types` |

**Steps:**
1. Create `goal-section.tsx`
   - Move the existing `GoalSectionProps` type definition and export it
   - Move the `GoalSection` component
   - Add imports: `GoalCard` from `@/components/goal-card`, `Goal` from `@/types`
   - Import its own LESS file
2. Create `goal-section.less`
   - Extract the section-related styles from `goals-summary-view.less`:
     - `&__section-title` (lines 86–96)
     - `&__section-count` (lines 98–100)
     - `&__section-list` (lines 102–106)
   - Rename BEM block from `.goals-summary-view__section-*` to `.goal-section` with proper BEM elements:
     - `.goal-section` (the `<section>` wrapper)
     - `&__title` (was `__section-title`)
     - `&__count` (was `__section-count`)
     - `&__list` (was `__section-list`)
   - Add `@import '../../styles/variables.less';` at the top
3. Update class names in the new `.tsx` to use the new BEM block
4. Remove the extracted styles from `goals-summary-view.less`
5. In `goals-summary-view.tsx`: replace inline definition with `import GoalSection from './goal-section'`

### What remains in `goals-summary-view.tsx`

After extraction:
- Imports (react, hooks, GoalFormModal, GoalSection, types)
- `GoalsSummaryView` component (~120 lines)

### Final file structure

```
goals-summary-view/
├── goals-summary-view.tsx             # main (imports sub-component)
├── goals-summary-view.less            # main styles only
├── goal-section.tsx                   # GoalSection sub-component
├── goal-section.less                  # goal section styles
└── index.ts                           # barrel (no changes needed)
```

---

## Execution Order

Recommended order (least to most complex):

1. **`goals-summary-view`** — simplest extraction (1 sub-component, small file, presentational)
2. **`goal-detail-view`** — medium extraction (1 sub-component, has its own BEM block already)
3. **`expense-quick-add`** — most complex (3 sub-components, mix of BEM strategies)

Each extraction is independent — they can be done in parallel or sequentially.

---

## Checklist Per Extraction

- [ ] New `.tsx` file created with kebab-case name matching the sub-component's own identity
- [ ] Props type defined as `type` (not `interface`) and exported
- [ ] Component uses `const` arrow function with `export default`
- [ ] New `.less` file created with matching name, imports `variables.less`
- [ ] BEM block name in `.less` matches the new file name in kebab-case
- [ ] Styles removed from the parent `.less` file (no duplication)
- [ ] Parent `.tsx` imports the new sub-component
- [ ] `index.ts` barrel unchanged (only re-exports main component)
- [ ] No `any` types, all props explicitly typed
- [ ] Application still compiles and works correctly

---

## What Is NOT Changing

- **Barrel `index.ts` files** — they already only export the main component, sub-components stay internal
- **Views `index.ts` root barrel** — no changes needed
- **Routing / imports from other files** — only internal reorganization
- **Component behavior / logic** — pure structural refactor, no functional changes
- **Files with a single component** — `closing-event/*`, `expenses-view`, `pulse-dashboard` remain unchanged
