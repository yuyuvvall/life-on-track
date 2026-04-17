# Migration Research: Align `client/src/` with UI Development Skill

> Generated 2026-02-27 — covers every file in `client/src/components/` and `client/src/views/`.

---

## 1. Executive Summary

The codebase has **two distinct tiers** of code quality:

| Tier | Folders | Follows Skill? |
|------|---------|----------------|
| **Recently refactored** | `components/goals-progress/`, `components/spending-chart/`, `components/integrity-heatmap/`, `views/closing-event/` | Mostly yes — kebab-case files, `type` for props, `export default`, `satisfies`, Storybook, barrel exports |
| **Legacy** | All other components (`TaskCard.tsx`, `GoalCard.tsx`, `WeeklyCalendarView.tsx`, etc.) and views (`PulseDashboard.tsx`, `ExpensesView.tsx`, `GoalsSummaryView.tsx`, `GoalDetailView.tsx`, `ExpenseQuickAdd.tsx`) | No — violates almost every rule |

**Key violations across the entire codebase:**

1. **No LESS files** — the project uses Tailwind CSS (`@tailwind` directives in `index.css`), not LESS/BEM at all
2. **No `em` units** — Tailwind classes use `rem`/`px` under the hood
3. **Heavy use of `useState` / `useEffect`** — most components are uncontrolled (own their state)
4. **PascalCase file names** for legacy components (e.g., `TaskCard.tsx`, `GoalCard.tsx`)
5. **Named exports** via `export function` instead of `export default` with `const` arrow functions
6. **`interface` instead of `type`** for props in legacy code
7. **Missing Storybook files** for ~70% of components
8. **Missing tests** for ~60% of components
9. **No sub-component `.less` files** — styles are all Tailwind utility classes inline

---

## 2. Styling System — Tailwind vs. LESS/BEM (**Global Issue**)

### Current state

- `client/src/index.css` uses `@tailwind base; @tailwind components; @tailwind utilities;`
- Every component uses Tailwind utility classes directly in JSX: `className="bg-surface-700 rounded-lg p-4"`
- Custom styles in `index.css` use `@apply` directives (Tailwind's way of composing utilities)
- There is **not a single `.less` file** in the entire `client/src/` tree

### Skill requirement

- Each sub-component needs its own `.less` file with BEM naming
- All sizing in `em` units
- LESS variables for color/theme tokens

### Gap

This is the **largest structural divergence**. Migrating from Tailwind to LESS/BEM affects every single component and every line of JSX that contains `className`. This is not a small refactor — it's a complete styling system replacement.

### Decision needed

> Should the project actually migrate from Tailwind to LESS/BEM, or should the skill be amended to support Tailwind? This is a fundamental architectural decision that affects every other migration step.

---

## 3. File-by-File Analysis

### 3.1 Components — Already Compliant (or Nearly)

#### `components/goals-progress/`

| Check | Status | Notes |
|-------|--------|-------|
| Kebab-case files | ✅ | `goals-progress.tsx`, `goal-item.tsx` |
| `type` for props | ✅ | `GoalsProgressProps`, `GoalItemProps` |
| Props exported | ✅ | |
| `const` arrow function | ✅ | |
| `export default` | ✅ | |
| Barrel `index.ts` | ✅ | |
| Fully controlled (no useState/useEffect) | ✅ | |
| Storybook with `satisfies`, `fn()`, `autodocs` | ✅ | |
| Tests | ✅ | |
| LESS file | ❌ | Uses Tailwind classes inline |

#### `components/spending-chart/`

| Check | Status | Notes |
|-------|--------|-------|
| Kebab-case files | ✅ | `spending-chart.tsx` |
| `type` for props | ✅ | `SpendingChartProps` |
| Props exported | ✅ | |
| `const` arrow function | ✅ | |
| `export default` | ✅ | |
| Barrel `index.ts` | ✅ | |
| Fully controlled (no useState/useEffect) | ✅ | |
| Storybook | ✅ | Uses `satisfies`, `autodocs`, realistic data |
| Tests | ✅ | |
| LESS file | ❌ | Tailwind classes inline |
| `fn()` for callbacks | N/A | No callback props |

#### `components/integrity-heatmap/`

| Check | Status | Notes |
|-------|--------|-------|
| Kebab-case files | ✅ | `integrity-heatmap.tsx` |
| `type` for props | ✅ | `IntegrityHeatmapProps` |
| Props exported | ✅ | |
| `const` arrow function | ✅ | |
| `export default` | ✅ | |
| Barrel `index.ts` | ✅ | |
| Fully controlled | ✅ | |
| Storybook | ✅ | `satisfies`, `fn()`, `autodocs`, realistic data |
| Tests | ✅ | |
| LESS file | ❌ | Tailwind inline |
| **Bug**: fail count uses `text-accent-green` | ⚠️ | Should be `text-accent-red` — test expects `.text-accent-red` |

---

### 3.2 Views — Already Compliant (or Nearly)

#### `views/closing-event/`

| File | Check | Status | Notes |
|------|-------|--------|-------|
| `day-notes-content.tsx` | Kebab-case, `type`, `export default`, controlled | ✅ | |
| `day-notes-content.stories.tsx` | `satisfies`, `autodocs` | ✅ | |
| `day-notes-content.test.tsx` | Present | ✅ | |
| `day-notes-modal.tsx` | Kebab-case, `type`, controlled, uses `children: ReactNode` | ✅ | |
| `day-notes-inline.tsx` | Same as modal | ✅ | |
| `integrity-edit-form.tsx` | Controlled, `type`, `export default` | ✅ | |
| `integrity-edit-form.test.tsx` | Present | ✅ | |
| `closing-event-view.tsx` | **Uses `useState`, `useEffect`, `useForm`** | ❌ | This is a **view/page** (not a ui-kit component), so hooks may be acceptable |
| `index.ts` barrel | Only exports `ClosingEventView` | ⚠️ | Sub-components (`DayNotesContent`, `DayNotesModal`, etc.) are not exported — acceptable if internal |
| LESS files | None | ❌ | Tailwind |

**Missing**: No stories for `DayNotesModal`, `DayNotesInline`, `IntegrityEditForm`, `ClosingEventView`.

---

### 3.3 Components — Need Full Migration

#### `TaskCard.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase `TaskCard.tsx` → should be `task-card/task-card.tsx` |
| Props definition | ❌ | Uses `interface TaskCardProps` → should be `type` |
| Export style | ❌ | `export function TaskCard` → should be `const TaskCard = ... ; export default TaskCard` |
| Controlled | ❌ | Uses `useState` × 6 (`isExpanded`, `newSubTaskText`, `swipeOffset`, `isEditing`, `editingSubTaskId`, `editingSubTaskText`) |
| Hooks | ❌ | `useUpdateTask`, `useUpdateSubTask`, `useAddSubTask`, `useDeleteSubTask` called inside |
| Own folder | ❌ | Flat file, no folder structure |
| Barrel export | ❌ | No `index.ts` |
| LESS file | ❌ | Tailwind inline |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |
| Lines | 296 | Large component — good candidate for decomposition |

#### `TaskEditModal.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `task-edit-modal/task-edit-modal.tsx` |
| Props definition | ❌ | `interface` → `type` |
| Export style | ❌ | Named export `export function` |
| Controlled | ❌ | `useState` × 4 (`title`, `category`, `deadline`, `error`), `useUpdateTask` hook |
| Own folder | ❌ | Flat file |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `TabBar.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `tab-bar/tab-bar.tsx` |
| Props definition | N/A | No props (reads route via `useLocation`) |
| Export style | ❌ | `export function TabBar` |
| Controlled | ❌ | Uses `useLocation()` router hook internally |
| Own folder | ❌ | Flat file |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `WeeklyCalendarView.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `weekly-calendar-view/weekly-calendar-view.tsx` |
| Props definition | ❌ | Uses `interface` for internal sub-component props |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useState` × 2, `useRef` × 2, `useCallback` × 3, `useMemo` × 2, `useTasks`, `useUpdateTask` |
| Own folder | ❌ | Flat file with inline sub-components (`DraggableTask`, `DayColumn`) |
| Lines | 386 | Very large — should be decomposed |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `IntegrityLogger.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `integrity-logger/integrity-logger.tsx` |
| Props definition | ❌ | `interface IntegrityLoggerProps` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useState` × 4, `useEffect` × 1, `useTodayWorkLog`, `useCreateWorkLog`, `useUpdateWorkLog` |
| Lines | 285 | Large — doing both compact and full mode |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `IntegrityModal.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `integrity-modal/integrity-modal.tsx` |
| Props definition | N/A | No props — reads from `useUIStore` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useState` × 3, `useUIStore`, `useTodayWorkLog`, `useCreateWorkLog` |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `GoalCard.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `goal-card/goal-card.tsx` |
| Props definition | ❌ | `interface GoalCardProps` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useState(false)` for `isEditing` |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `GoalFormModal.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `goal-form-modal/goal-form-modal.tsx` |
| Props definition | ❌ | `interface GoalFormModalProps` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useState` × 7, `useCreateGoal`, `useUpdateGoal` |
| Lines | 256 | Large |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `QuickAddModal.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `quick-add-modal/quick-add-modal.tsx` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useState` × 7, `useEffect` × 1, `useUIStore`, `useCreateExpense`, `useCreateTask`, `useAddSubTask` |
| Lines | 276 | Large |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `QuickAddFAB.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `quick-add-fab/quick-add-fab.tsx` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useRef` × 2, `useCallback` × 5, `useNavigate`, `useUIStore` |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `FocusList.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `focus-list/focus-list.tsx` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useMemo` × 2, `useTasks`, `useDeleteTask` |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `WeeklyStats.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `weekly-stats/weekly-stats.tsx` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useGoals`, `useWeeklySummary` |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

---

### 3.4 Views — Need Full Migration

#### `PulseDashboard.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `pulse-dashboard/pulse-dashboard.tsx` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useState`, `useEffect`, `useUIStore`, `useTodayWorkLog` |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `ExpensesView.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `expenses-view/expenses-view.tsx` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useState` × 1, `useEffect` × 1, `useMemo` × 4, multiple hooks |
| Lines | 307 | Large |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `GoalsSummaryView.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `goals-summary-view/goals-summary-view.tsx` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useState`, `useGoals`, `useDeleteGoal` |
| Has inline sub-component | ⚠️ | `GoalSection` defined as `function GoalSection()` — should be extracted |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `GoalDetailView.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `goal-detail-view/goal-detail-view.tsx` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useState` × 7+, `useParams`, `useNavigate`, many hooks |
| Has inline sub-component | ⚠️ | `GoalLogEditModal` defined inline — should be extracted |
| Lines | 519 (!) | Very large — strong candidate for decomposition |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

#### `ExpenseQuickAdd.tsx`

| Check | Status | Detail |
|-------|--------|--------|
| File name | ❌ | PascalCase → `expense-quick-add/expense-quick-add.tsx` |
| Export style | ❌ | `export function` |
| Controlled | ❌ | `useState` × 8+, `useEffect` × 1, many hooks |
| Has inline sub-components | ⚠️ | `KeypadButton`, `RecurringOptionsModal`, `DatePickerModal` defined inline — should be extracted |
| Lines | 718 (!) | Largest file — strong candidate for decomposition |
| Storybook | ❌ | Missing |
| Tests | ❌ | Missing |

---

### 3.5 Barrel Exports

#### `components/index.ts`

| Check | Status | Detail |
|-------|--------|-------|
| Exports all components | ✅ | All 13 components exported |
| Exports Props types | ⚠️ | Only exports types for `IntegrityHeatmapProps`, `SpendingChartProps`, `GoalsProgressProps` — missing types for all legacy components |
| Uses named exports | ✅ | `export { TaskCard } from './TaskCard'` |
| Naming mismatch | ⚠️ | Mixes kebab-case paths (`./integrity-heatmap`) with PascalCase paths (`./TaskCard`) |

#### `views/index.ts`

| Check | Status | Detail |
|-------|--------|-------|
| Missing exports | ❌ | Does NOT export `ExpensesView`, `ExpenseQuickAdd` |
| Only 4 of 6 views exported | ❌ | |

---

## 4. Violation Summary by Skill Rule

### 4.1 File Naming (Kebab-Case)

**13 files need renaming** (all legacy components and views):

| Current | Required |
|---------|----------|
| `TaskCard.tsx` | `task-card/task-card.tsx` |
| `TaskEditModal.tsx` | `task-edit-modal/task-edit-modal.tsx` |
| `TabBar.tsx` | `tab-bar/tab-bar.tsx` |
| `WeeklyCalendarView.tsx` | `weekly-calendar-view/weekly-calendar-view.tsx` |
| `IntegrityLogger.tsx` | `integrity-logger/integrity-logger.tsx` |
| `IntegrityModal.tsx` | `integrity-modal/integrity-modal.tsx` |
| `GoalCard.tsx` | `goal-card/goal-card.tsx` |
| `GoalFormModal.tsx` | `goal-form-modal/goal-form-modal.tsx` |
| `QuickAddModal.tsx` | `quick-add-modal/quick-add-modal.tsx` |
| `QuickAddFAB.tsx` | `quick-add-fab/quick-add-fab.tsx` |
| `FocusList.tsx` | `focus-list/focus-list.tsx` |
| `WeeklyStats.tsx` | `weekly-stats/weekly-stats.tsx` |
| `PulseDashboard.tsx` | `pulse-dashboard/pulse-dashboard.tsx` |
| `ExpensesView.tsx` | `expenses-view/expenses-view.tsx` |
| `GoalsSummaryView.tsx` | `goals-summary-view/goals-summary-view.tsx` |
| `GoalDetailView.tsx` | `goal-detail-view/goal-detail-view.tsx` |
| `ExpenseQuickAdd.tsx` | `expense-quick-add/expense-quick-add.tsx` |

### 4.2 Controlled Components (No `useState` / `useEffect`)

**14 components use internal state.** The most egregious:

| Component | `useState` count | `useEffect` count | Hooks |
|-----------|------------------|--------------------|-------|
| `ExpenseQuickAdd` | 8+ | 1 | 4 mutation hooks |
| `GoalDetailView` | 7+ | 0 | 4 hooks |
| `QuickAddModal` | 7 | 1 | 3 hooks |
| `GoalFormModal` | 7 | 0 | 2 hooks |
| `TaskCard` | 6 | 0 | 4 hooks |
| `IntegrityLogger` | 4 | 1 | 3 hooks |
| `WeeklyCalendarView` | 2 | 0 | 2 hooks |
| `IntegrityModal` | 3 | 0 | 3 hooks |
| `TaskEditModal` | 4 | 0 | 1 hook |
| `ClosingEventView` | 6+ | 3 | 5 hooks |

> **Note**: For views/pages, hooks may be acceptable since they are the "smart" layer that connects UI components to data. The skill seems designed for a ui-kit library of presentational components. A pragmatic approach: extract dumb presentational sub-components that are fully controlled, and let the view-level containers use hooks.

### 4.3 Props Definition — `type` vs `interface`

**7 components use `interface`**:

- `TaskEditModal` → `interface TaskEditModalProps`
- `TaskCard` → `interface TaskCardProps`
- `GoalCard` → `interface GoalCardProps`
- `GoalFormModal` → `interface GoalFormModalProps`
- `IntegrityLogger` → `interface IntegrityLoggerProps`
- `GoalsSummaryView` → `interface GoalSectionProps`
- `GoalDetailView` → inline `{ log: GoalLog; goal: Goal; onClose: () => void }`

### 4.4 Export Style — `export default` with `const` arrow

**13 components use `export function ComponentName()`** (named export + function declaration):

All legacy components and views use this pattern. Should be migrated to:
```tsx
const ComponentName = (props: ComponentNameProps) => { ... }
export default ComponentName
```

### 4.5 Missing Storybook Files

**13 components/views need stories**:

- `TaskCard`, `TaskEditModal`, `TabBar`, `WeeklyCalendarView`
- `IntegrityLogger`, `IntegrityModal`, `GoalCard`, `GoalFormModal`
- `QuickAddModal`, `QuickAddFAB`, `FocusList`, `WeeklyStats`
- (Views): `PulseDashboard`, `ExpensesView`, `GoalsSummaryView`, `GoalDetailView`, `ExpenseQuickAdd`

### 4.6 Missing Test Files

**Same 13+ components** lack tests.

### 4.7 Inline Sub-Components That Should Be Extracted

| Parent File | Inline Sub-Components |
|-------------|----------------------|
| `WeeklyCalendarView.tsx` | `DraggableTask`, `DayColumn` |
| `GoalDetailView.tsx` | `GoalLogEditModal` |
| `GoalsSummaryView.tsx` | `GoalSection` |
| `ExpenseQuickAdd.tsx` | `KeypadButton`, `RecurringOptionsModal`, `DatePickerModal` |

### 4.8 FontAwesome Usage

- ✅ `goals-progress/goal-item.tsx` — correctly imports individual icons
- ✅ `integrity-heatmap/integrity-heatmap.tsx` — correctly imports individual icons
- ✅ `closing-event/` components — correctly imports individual icons
- ❌ Legacy components use inline SVGs instead of FontAwesome (e.g., `TaskCard`, `GoalCard`, `QuickAddFAB`, `ExpenseQuickAdd`) — inconsistent with the skill's FontAwesome requirement

### 4.9 MUI Usage

- No MUI imports found in any component — N/A for now

---

## 5. Styling Details

### Current CSS Architecture

```
index.css (Tailwind + @apply utility classes)
├── Global base styles (scrollbar, body)
├── Badge classes (.badge, .badge-work, etc.)
├── Button classes (.btn, .btn-primary, .btn-ghost)
├── Integrity buttons (.integrity-btn-*)
├── Heatmap cells (.heatmap-*)
├── Markdown content styles
└── Form input global styles
```

All component-level styling is Tailwind utility classes in JSX. No component-scoped stylesheets exist.

### Skill Requirement

- LESS files per sub-component
- BEM naming (`.block__element--modifier`)
- `em` units for sizing
- LESS variables for colors

---

## 6. What's Already Good

1. **TypeScript everywhere** — strict types, no `any`
2. **Three component folders already follow the skill** (`goals-progress`, `spending-chart`, `integrity-heatmap`)
3. **`closing-event/` view sub-components** are well-structured and controlled
4. **Root barrel exports** exist for both `components/` and `views/`
5. **FontAwesome is used correctly** in the newer components
6. **`satisfies Meta<typeof Component>`** used correctly in all existing stories
7. **Realistic data** in story files (no "John Doe")
8. **`fn()` for callbacks** in stories that have them

---

## 7. Recommended Migration Priority

### Phase 0: Decision — Tailwind vs. LESS/BEM
This must be decided first as it affects everything. Options:
- **A)** Migrate entire project to LESS/BEM (massive effort, loses Tailwind benefits)
- **B)** Keep Tailwind but adapt the skill (update skill to accept Tailwind utility classes)
- **C)** Hybrid — use LESS for component-scoped styles, keep Tailwind for layout utilities

### Phase 1: Low-Risk Structural Changes
- Rename files to kebab-case and create folder structure
- Convert `interface` → `type` for props
- Convert `export function` → `const` arrow + `export default`
- Update barrel exports
- Update all import paths (in `App.tsx`, `components/index.ts`, `views/index.ts`, and cross-references)

### Phase 2: Extract Presentational Sub-Components
- Extract inline sub-components into their own files
- Make extracted components fully controlled
- Keep parent view/page components as "smart" containers with hooks

### Phase 3: Add Missing Storybook Files
- Create `.stories.tsx` for all components
- Follow `satisfies`, `fn()`, `autodocs`, `layout: 'centered'` pattern

### Phase 4: Add Missing Tests
- Create `.test.tsx` for all components

### Phase 5: Styling Migration (if Phase 0 decides on LESS)
- Create `.less` files for each component
- Migrate Tailwind classes to BEM/LESS
- Replace `em` units
- Define LESS variables

---

## 8. File Count Summary

| Category | Count |
|----------|-------|
| Total component/view files | 41 |
| Files already compliant | ~10 (closing-event subs, goals-progress, spending-chart, integrity-heatmap) |
| Files needing structural migration | ~17 (rename + refactor) |
| Missing story files needed | ~13 |
| Missing test files needed | ~13 |
| Missing LESS files needed | ~25+ (if migrating to LESS) |
