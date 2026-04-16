# Research: Files With Multiple Components in `client/src/views`

## Overview

Scanned all `.tsx` component files under `client/src/views/` (excluding test files, stories, and barrel `index.ts` files). Below are the files that contain **more than one React component** defined in the same file.

---

## 1. `expense-quick-add/expense-quick-add.tsx` — **4 components**

| Component | Line | Scope | Description |
|-----------|------|-------|-------------|
| **KeypadButton** | 25 | Internal | A reusable button for the numeric keypad. Accepts `label`, `onClick`, and an optional `variant` prop (`default`, `operator`, `delete`, `calendar`) to control styling. Renders a single `<button>` element. Used repeatedly in the keypad grid inside `ExpenseQuickAdd`. |
| **RecurringOptionsModal** | 48 | Internal | A modal dialog for configuring a recurring expense schedule. Lets the user choose between weekly/monthly frequency and pick a specific day. Uses local state for temporary values and calls `onSave`/`onCancel` callbacks to communicate with the parent. |
| **DatePickerModal** | 146 | Internal | A modal with a full calendar for date selection. Supports month navigation (prev/next), highlights today and the currently selected date, and calls `onSelect` when a day is picked. |
| **ExpenseQuickAdd** | 286 | **Exported (default)** | The main view for adding or editing an expense. Manages the full form state: amount input via keypad, category selection, date picking, notes, and recurring options. Orchestrates all three internal components above — renders `KeypadButton` in the keypad grid, opens `DatePickerModal` for date selection, and opens `RecurringOptionsModal` for recurring configuration. Handles both create and edit flows (reads expense ID from URL params). |

### How they build together

```
ExpenseQuickAdd (main view)
├── KeypadButton × many  (keypad grid for amount entry)
├── DatePickerModal       (opened when calendar button is pressed)
└── RecurringOptionsModal (opened when recurring toggle is enabled)
```

`ExpenseQuickAdd` is the orchestrator. It holds all form state (`amount`, `category`, `date`, `note`, `recurringConfig`) and renders the three helper components as needed. `KeypadButton` is a pure presentational component used inline in the keypad. `DatePickerModal` and `RecurringOptionsModal` are conditional modals controlled by boolean state flags (`showDatePicker`, `showRecurringOptions`).

---

## 2. `goal-detail-view/goal-detail-view.tsx` — **2 components**

| Component | Line | Scope | Description |
|-----------|------|-------|-------------|
| **GoalLogEditModal** | 8 | Internal | A modal for editing an existing goal log entry. Supports editing the date, value/status (Did it / Didn't for frequency goals, or numeric/page input for others), and an optional note. Uses `useUpdateGoalLog` mutation and closes on success. |
| **GoalDetailView** | 139 | **Exported (default)** | The main detail page for a single goal. Displays the goal header, progress indicators, sub-goals, statistics, habit-tracking buttons (for frequency goals), a log form (for numeric/reading goals), and a scrollable progress history list. Controls modals for editing the goal, adding sub-goals, and editing individual log entries. |

### How they build together

```
GoalDetailView (main view)
└── GoalLogEditModal  (opened when user taps a log entry to edit it)
```

`GoalDetailView` manages an `editingLog` state. When the user clicks a log entry in the progress history, `setEditingLog(log)` is called, which causes `GoalLogEditModal` to render. After saving or cancelling, `editingLog` is set back to `null` and the modal closes. The view also uses imported components (`GoalFormModal`) for other modal interactions but those are defined externally.

Additionally, there is an IIFE render block (lines ~484–558) that returns JSX for the progress history list — this is inline render logic, not a separate component.

---

## 3. `goals-summary-view/goals-summary-view.tsx` — **2 components**

| Component | Line | Scope | Description |
|-----------|------|-------|-------------|
| **GoalsSummaryView** | 8 | **Exported (default)** | The main goals tracker view. Loads all goals, computes summary statistics (active count, reading count, habits count), and renders a `GoalSection` for each goal type. Also manages the create-goal modal and handles the empty state. |
| **GoalSection** | 129 | Internal | A presentational section that renders a group of goals by type (reading, habits, numeric). Displays a section title with an icon, a count badge, and maps over the goals to render individual `GoalCard` components (imported externally). |

### How they build together

```
GoalsSummaryView (main view)
├── GoalSection (type="reading")
│   └── GoalCard × n
├── GoalSection (type="frequency")
│   └── GoalCard × n
└── GoalSection (type="numeric")
    └── GoalCard × n
```

`GoalsSummaryView` fetches goals and groups them by type, then renders one `GoalSection` per type. `GoalSection` is a reusable layout component that accepts a title, icon, and array of goals, rendering each as a `GoalCard`. The `GoalCard` component is imported from elsewhere.

---

## Files With Only 1 Component (no separation needed)

These files each contain exactly one component:

| File | Component | Description |
|------|-----------|-------------|
| `closing-event/closing-event-view.tsx` | `ClosingEventView` | Weekly closing event page with heatmap, charts, day notes, and reflection |
| `closing-event/day-notes-content.tsx` | `DayNotesContent` | Read-only display of success/missed notes for a work log |
| `closing-event/day-notes-modal.tsx` | `DayNotesModal` | Modal wrapper for day notes on mobile |
| `closing-event/day-notes-inline.tsx` | `DayNotesInline` | Inline panel for day notes on desktop |
| `closing-event/integrity-edit-form.tsx` | `IntegrityEditForm` | Form for editing integrity score and notes |
| `expenses-view/expenses-view.tsx` | `ExpensesView` | Expense list with timeline and category views |
| `pulse-dashboard/pulse-dashboard.tsx` | `PulseDashboard` | Main dashboard with stats, tasks, and integrity logger |

---

## Summary Table

| File | Components | Needs Separation? |
|------|------------|-------------------|
| `expense-quick-add/expense-quick-add.tsx` | 4 (`KeypadButton`, `RecurringOptionsModal`, `DatePickerModal`, `ExpenseQuickAdd`) | Yes |
| `goal-detail-view/goal-detail-view.tsx` | 2 (`GoalLogEditModal`, `GoalDetailView`) | Yes |
| `goals-summary-view/goals-summary-view.tsx` | 2 (`GoalsSummaryView`, `GoalSection`) | Yes |
| All other files | 1 each | No |
