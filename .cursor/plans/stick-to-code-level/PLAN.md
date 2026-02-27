# ClosingEventView — Refactoring Plan

> Bring `ClosingEventView` and its child components into compliance with
> `SKILL.md` (UI development standard) and `CLAUDE.md` (project guidelines).
>
> Each part assumes all previous parts are already completed.
> Parts are ordered by importance: critical bugs → structural → patterns → polish.

---

## Conflicts & Pragmatic Decisions

Before starting, two conflicts between the standards and the actual codebase need to be acknowledged:

| Standard says | Codebase reality | Decision |
|---|---|---|
| **SKILL.md**: LESS + BEM styling with `em` units | Entire project uses **Tailwind CSS** — config, PostCSS, every component, global CSS. No LESS anywhere. | **Keep Tailwind as-is.** Introducing LESS for just these components while the rest of the app stays Tailwind creates a split styling system with no benefit. |
| **CLAUDE.md**: "Use Axios-based apiClient" | API client is built on **raw `fetch`** with a typed `request<T>()` wrapper. Every hook uses it. | **Keep fetch.** The existing client is typed, handles errors, supports purpose headers. Swapping to Axios would touch every hook and API call for no functional gain. |
| **CLAUDE.md**: "Use Bootstrap 5 for layout" | Project uses **Tailwind CSS** exclusively. | **Keep Tailwind.** Same rationale as above — Bootstrap migration would rewrite the entire UI. |

---

## Part 1 — Fix Critical Bug: Dead Auto-Populate Code

**Priority**: Critical — broken feature, dead code in production  
**Files changed**: `client/src/views/ClosingEventView.tsx`

### Problem

Lines 335–339 misuse `useState` as if it were `useEffect`:

```tsx
useState(() => {
  if (autoPopulatedContent && !reflection) {
    setReflection(autoPopulatedContent);
  }
});
```

This never fires because: (a) `useState`'s initializer runs only on first render when `summary` hasn't loaded yet, (b) it never re-runs when `autoPopulatedContent` changes, (c) the return value is discarded.

### Changes

1. **Replace `useState` with `useEffect`** in `ClosingEventView`:

```tsx
useEffect(() => {
  if (autoPopulatedContent && !reflection) {
    setReflection(autoPopulatedContent);
  }
}, [autoPopulatedContent]);
```

2. **Remove the stale `handleUseTemplate` function** — with auto-populate working, the manual button becomes redundant when reflection is empty. Keep the "Use Template" button but change it to only appear when the user has cleared the reflection after auto-populate (i.e., they deleted text and want to re-populate).

### Verification

- Load the view with a week that has missed opportunity notes
- Confirm the reflection textarea is auto-populated on load
- Confirm "Use Template" still works after manually clearing the textarea

---

## Part 2 — Extract Internal Components Into Separate Files

**Priority**: High — SKILL.md requires each component in its own file  
**Files changed**: `ClosingEventView.tsx` (slimmed), 4 new files created

### Problem

`ClosingEventView.tsx` is 524 lines with 4 internal components (`DayNotesContent`, `IntegrityEditForm`, `DayNotesModal`, `DayNotesInline`) defined inline. SKILL.md requires each component in its own file.

### New File Structure

All extracted components go into `client/src/components/` as new files (kebab-case per SKILL.md). They are **sub-components of the closing-event view** and not independently reusable, so they live alongside the view:

```
client/src/views/
├── closing-event/
│   ├── closing-event-view.tsx          # main view (renamed from ClosingEventView.tsx)
│   ├── day-notes-content.tsx           # extracted
│   ├── integrity-edit-form.tsx         # extracted
│   ├── day-notes-modal.tsx             # extracted
│   ├── day-notes-inline.tsx            # extracted
│   └── index.ts                        # barrel: exports ClosingEventView
```

### Changes

1. **Create `client/src/views/closing-event/` folder**
2. **Move & rename `ClosingEventView.tsx` → `closing-event/closing-event-view.tsx`**
3. **Extract `DayNotesContent`** into `day-notes-content.tsx`
4. **Extract `IntegrityEditForm`** into `integrity-edit-form.tsx`
5. **Extract `DayNotesModal`** into `day-notes-modal.tsx`
6. **Extract `DayNotesInline`** into `day-notes-inline.tsx`
7. **Create barrel** `closing-event/index.ts`:
   ```ts
   export { default as ClosingEventView } from './closing-event-view'
   export type { ClosingEventViewProps } from './closing-event-view'
   ```
8. **Update `client/src/views/index.ts`** to import from the new barrel:
   ```ts
   export { ClosingEventView } from './closing-event'
   ```
9. **Delete the old `ClosingEventView.tsx`** file
10. **Update `App.tsx`** import if it imports directly (it currently uses `@/views/ClosingEventView` — update to `@/views/closing-event` or leave via barrel)

### Verification

- App compiles with `npm run build`
- `/weekly` route renders identically
- No import errors

---

## Part 3 — Make Extracted Components Fully Controlled

**Priority**: High — SKILL.md mandates no `useState`/`useEffect` in components  
**Files changed**: All 4 extracted files + `closing-event-view.tsx`

### Problem

Several extracted components own state internally:
- `IntegrityEditForm` — has `useState` for `score`, `successNote`, `missedNote`
- `DayNotesModal` — has `useState(isEditing)` + calls `useUpdateWorkLog()`
- `DayNotesInline` — has `useState(isEditing)` + calls `useUpdateWorkLog()`

SKILL.md: "NO `useState` — the component never owns state. All data comes through props."

### Changes

#### 3a. `IntegrityEditForm` → Fully controlled

Lift all form state to the parent. The component receives values + onChange callbacks:

```tsx
export type IntegrityEditFormProps = {
  score: 0 | 1
  successNote: string
  missedNote: string
  isPending: boolean
  onScoreChange: (score: 0 | 1) => void
  onSuccessNoteChange: (value: string) => void
  onMissedNoteChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}
```

The parent (`closing-event-view.tsx`) manages the edit form state and calls the mutation on save.

#### 3b. `DayNotesModal` → Fully controlled

Remove `useState(isEditing)` and `useUpdateWorkLog()`. Receive everything via props:

```tsx
export type DayNotesModalProps = {
  log: WorkLog
  date: string
  isEditing: boolean
  editScore: 0 | 1
  editSuccessNote: string
  editMissedNote: string
  isSaving: boolean
  onEditClick: () => void
  onScoreChange: (score: 0 | 1) => void
  onSuccessNoteChange: (value: string) => void
  onMissedNoteChange: (value: string) => void
  onSave: () => void
  onCancelEdit: () => void
  onClose: () => void
}
```

#### 3c. `DayNotesInline` → Fully controlled

Same pattern as `DayNotesModal` — remove internal state and hooks:

```tsx
export type DayNotesInlineProps = {
  log: WorkLog
  date: string
  isEditing: boolean
  editScore: 0 | 1
  editSuccessNote: string
  editMissedNote: string
  isSaving: boolean
  onEditClick: () => void
  onScoreChange: (score: 0 | 1) => void
  onSuccessNoteChange: (value: string) => void
  onMissedNoteChange: (value: string) => void
  onSave: () => void
  onCancelEdit: () => void
  onClose: () => void
}
```

#### 3d. `DayNotesContent` — Already controlled ✓

No changes needed. Already receives `log` via props, no state.

#### 3e. Update `closing-event-view.tsx`

The view now owns all state that was previously in child components:
- `isEditing: boolean`
- `editScore: 0 | 1`
- `editSuccessNote: string`
- `editMissedNote: string`
- The `useUpdateWorkLog()` mutation

The view passes these down as props and handles all mutation logic.

### Verification

- Edit a day's integrity from the heatmap (both mobile modal and desktop inline)
- Confirm save works, heatmap updates, form closes
- Confirm cancel resets form state

---

## Part 4 — TypeScript Patterns: `type` + Arrow Functions + `export default`

**Priority**: High — SKILL.md mandates specific authoring patterns  
**Files changed**: All component files in `closing-event/`, plus `IntegrityHeatmap.tsx`, `SpendingChart.tsx`, `GoalsProgress.tsx`

### Problem

Current code uses:
- `interface` for props (SKILL.md: use `type`)
- `function` declarations (SKILL.md: use `const` arrow functions)
- Named exports (SKILL.md: use `export default`)
- Inline anonymous prop types (SKILL.md: export the props type)

### Changes

#### 4a. Extracted sub-components (`day-notes-content.tsx`, etc.)

Already addressed in Part 3 where we define proper `type XxxProps`. In this part, ensure each file follows the exact authoring pattern:

```tsx
export type DayNotesContentProps = {
  log: WorkLog
}

const DayNotesContent = ({ log }: DayNotesContentProps) => {
  return (/* JSX */)
}

export default DayNotesContent
```

#### 4b. `IntegrityHeatmap`

File: `client/src/components/IntegrityHeatmap.tsx`

- Rename file to `client/src/components/integrity-heatmap/integrity-heatmap.tsx`
- Create folder + `index.ts` barrel
- Change `interface IntegrityHeatmapProps` → `export type IntegrityHeatmapProps`
- Change `export function IntegrityHeatmap` → `const IntegrityHeatmap = (...) => { ... }` + `export default IntegrityHeatmap`
- Update barrel `client/src/components/index.ts`

#### 4c. `SpendingChart`

File: `client/src/components/SpendingChart.tsx`

Same transformations:
- Rename to `client/src/components/spending-chart/spending-chart.tsx`
- Create folder + `index.ts` barrel
- `interface` → `export type`
- `export function` → `const` + `export default`

#### 4d. `GoalsProgress`

File: `client/src/components/GoalsProgress.tsx`

Same transformations, plus this component also needs to become controlled (it currently has `useState` + hooks). See Part 4e.

- Rename to `client/src/components/goals-progress/goals-progress.tsx`
- Internal `GoalItem` extracted to `goals-progress/goal-item.tsx`
- Create folder + `index.ts` barrel

#### 4e. Make `GoalsProgress` controlled

`GoalsProgress` currently has:
- `useState(expandedGoalId)` — lift to parent
- `useLogGoalProgress()` — move to parent (the view)
- `GoalItem` uses `useGoalLogs()` — move to parent or accept logs as prop

New props:

```tsx
export type GoalsProgressProps = {
  goals: Goal[]
  expandedGoalId: string | null
  expandedGoalLogs: GoalLog[]
  isLogsLoading: boolean
  isLogging: boolean
  onGoalToggle: (goalId: string) => void
  onQuickLog: (goal: Goal) => void
}
```

The parent view manages `expandedGoalId`, calls `useGoalLogs` conditionally, and passes results down.

#### 4f. Update all barrel files

- `client/src/components/index.ts` — update imports to use new folder paths
- `client/src/views/index.ts` — already updated in Part 2

### Verification

- TypeScript compiles cleanly (`npm run build`)
- No `interface` used for component props in any changed file
- Every component file uses `const` arrow + `export default`
- Every component exports its props `type`

---

## Part 5 — File Naming: kebab-case Everything

**Priority**: High — SKILL.md mandates kebab-case file names  
**Files changed**: Renames across `components/` and `views/`

### Problem

All current file names are PascalCase (`IntegrityHeatmap.tsx`, `SpendingChart.tsx`, etc.). SKILL.md requires kebab-case.

### Changes

> Note: Parts 2 and 4 already create new files in kebab-case. This part handles the remaining renames and ensures consistency.

Components already moved to kebab-case folders in Part 4:
- `integrity-heatmap/integrity-heatmap.tsx` ✓
- `spending-chart/spending-chart.tsx` ✓
- `goals-progress/goals-progress.tsx` ✓

Remaining renames needed for files NOT part of this refactoring (but referenced by it):
- No action needed — only the files we touch get renamed. Other components remain as-is until their own refactoring pass.

### Barrel updates

All barrels already updated in Parts 2 and 4.

### Verification

- No PascalCase `.tsx` files exist in `closing-event/`, `integrity-heatmap/`, `spending-chart/`, `goals-progress/`
- All imports resolve correctly
- Build succeeds

---

## Part 6 — Install FontAwesome & Replace Unicode Icons

**Priority**: Medium — CLAUDE.md mandates FontAwesome for icons  
**New dependency**: `@fortawesome/fontawesome-svg-core`, `@fortawesome/free-solid-svg-icons`, `@fortawesome/react-fontawesome`  
**Files changed**: `day-notes-content.tsx`, `integrity-edit-form.tsx`, `day-notes-modal.tsx`, `day-notes-inline.tsx`, `integrity-heatmap.tsx`, `goals-progress.tsx`

### Problem

Current code uses raw Unicode characters for icons: `✓`, `✗`, `✎`, `×`, `+`. CLAUDE.md requires FontAwesome.

### Changes

1. **Install FontAwesome**:
   ```bash
   cd client && npm install @fortawesome/fontawesome-svg-core @fortawesome/free-solid-svg-icons @fortawesome/react-fontawesome
   ```

2. **Replace icons** across all files:

| Current | FontAwesome replacement | Used in |
|---|---|---|
| `✓` (checkmark) | `faCheck` | heatmap, day notes, edit form |
| `✗` (cross) | `faXmark` | heatmap, day notes, edit form |
| `✎` (edit pencil) | `faPenToSquare` | day notes modal/inline |
| `×` (close) | `faXmark` | day notes inline close button |
| `+` (plus) | `faPlus` | goals progress quick-log button |
| chevron down SVG | `faChevronDown` | goals progress accordion |

3. **Import pattern** per SKILL.md:
   ```tsx
   import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
   import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons'
   ```

### Verification

- All icons render correctly at all sizes
- No raw Unicode symbols remain in the changed files
- Icons are visually consistent with the design system colors

---

## Part 7 — Install react-hook-form & Convert IntegrityEditForm

**Priority**: Medium — CLAUDE.md mandates react-hook-form for all forms  
**New dependency**: `react-hook-form`  
**Files changed**: `integrity-edit-form.tsx`, `closing-event-view.tsx`

### Problem

`IntegrityEditForm` manages form data through raw state/callbacks. CLAUDE.md requires react-hook-form.

### Important Note

Since Part 3 already made `IntegrityEditForm` fully controlled (stateless), the form's field values come from props. react-hook-form is most useful for uncontrolled forms with validation. In a controlled-component architecture, using react-hook-form means the parent registers the form and passes `register`/`control` objects down, or we use `useForm` at the view level.

### Changes

1. **Install react-hook-form**:
   ```bash
   cd client && npm install react-hook-form
   ```

2. **In `closing-event-view.tsx`**: Use `useForm` to manage the edit form state:
   ```tsx
   const editForm = useForm<IntegrityEditData>({
     defaultValues: { score: 1, successNote: '', missedNote: '' }
   });
   ```

3. **Reset form** when a day is selected for editing (populate from the work log)

4. **`IntegrityEditForm`** receives `register` and `control` from the parent:
   ```tsx
   export type IntegrityEditFormProps = {
     control: Control<IntegrityEditData>
     register: UseFormRegister<IntegrityEditData>
     isPending: boolean
     onSave: () => void
     onCancel: () => void
   }
   ```

5. **Add validation** (optional enhancement): score is required, notes are optional

### Verification

- Edit form works for both modal and inline
- Form resets when selecting a different day
- Save submits correct data

---

## Part 8 — Reflection Submit: Add Mutation, Feedback & Error Handling

**Priority**: Medium — bug/UX issue found in RESEARCH.md  
**Files changed**: `closing-event-view.tsx`, `client/src/hooks/useWeeklySummary.ts`

### Problem

The "Submit Reflection" button calls `weeklyApi.submitReflection()` directly with no loading state, success feedback, or error handling. The user gets no indication the submission worked.

### Changes

1. **Create `useSubmitReflection` mutation** in `useWeeklySummary.ts`:
   ```tsx
   export function useSubmitReflection() {
     return useMutation({
       mutationFn: (reflection: string) =>
         weeklyApi.submitReflection(reflection, 'Submit weekly reflection'),
     });
   }
   ```

2. **Use the mutation in `closing-event-view.tsx`**:
   ```tsx
   const submitReflection = useSubmitReflection();
   ```

3. **Update the submit button**:
   - Disable while `submitReflection.isPending`
   - Show "Submitting..." text while pending
   - Show success state briefly (green text, "Submitted ✓") on success
   - Show error message on failure

4. **Export from hooks barrel** (`client/src/hooks/index.ts`)

### Verification

- Click Submit → button shows loading state
- Successful submission shows brief confirmation
- Network error shows error feedback
- Button is disabled during submission (prevents double-submit)

---

## Part 9 — Storybook Setup + Stories for Each Component

**Priority**: Low — SKILL.md requires stories, but no Storybook exists yet  
**New dependencies**: `@storybook/react-vite`, `storybook`  
**Files created**: `.storybook/` config, 4 story files

### Problem

SKILL.md requires a `.stories.tsx` file for each main component. The project has no Storybook setup at all.

### Changes

1. **Initialize Storybook**:
   ```bash
   cd client && npx storybook@latest init --builder vite
   ```

2. **Create story files** (per SKILL.md pattern with `satisfies`, `fn()`, `autodocs`):

   - `integrity-heatmap/integrity-heatmap.stories.tsx`
     - Default (full week, mixed scores)
     - AllSuccess (all 7 days green)
     - AllMissed (all 7 days red)
     - EmptyWeek (no logs)
     - WithNotes (days with notes get ring indicator)

   - `spending-chart/spending-chart.stories.tsx`
     - Default (multiple categories)
     - SingleCategory
     - NoExpenses (empty state)
     - HighAmount (tests formatting)

   - `goals-progress/goals-progress.stories.tsx`
     - Default (4 goals, mixed progress)
     - NoGoals (empty state)
     - AllComplete (all 100%)
     - ManyGoals (>4, shows "+N more" link)
     - WithExpandedLogs

   - `closing-event/day-notes-content.stories.tsx`
     - Default (both notes populated)
     - SuccessOnly
     - MissedOnly
     - NoNotes (both null)

### Verification

- `npm run storybook` launches without errors
- All stories render correctly
- `autodocs` generates prop documentation

---

## Part 10 — Testing

**Priority**: Low — CLAUDE.md requires `.test.ts` files  
**New dependencies**: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`  
**Files created**: Test files alongside components

### Problem

No test files exist. CLAUDE.md mandates `.test.ts` files.

### Changes

1. **Install test dependencies**:
   ```bash
   cd client && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
   ```

2. **Add Vitest config** to `vite.config.ts`

3. **Create test files**:
   - `day-notes-content.test.tsx` — renders notes, shows empty state
   - `integrity-edit-form.test.tsx` — calls callbacks, renders form fields
   - `integrity-heatmap.test.tsx` — renders 7 days, handles clicks
   - `spending-chart.test.tsx` — renders categories, empty state
   - `goals-progress.test.tsx` — renders goals, quick log button
   - `closing-event-view.test.tsx` — integration test with mocked hooks

4. **Add test script** to `package.json`:
   ```json
   "test": "vitest run",
   "test:watch": "vitest"
   ```

### Verification

- `npm test` passes all tests
- Coverage includes all extracted components

---

## Summary: Execution Order

| Part | Priority | What | New Deps |
|---|---|---|---|
| 1 | Critical | Fix useState→useEffect bug | — |
| 2 | High | Extract components into separate files | — |
| 3 | High | Make components fully controlled | — |
| 4 | High | TypeScript: `type`, arrow functions, `export default` | — |
| 5 | High | kebab-case file names | — |
| 6 | Medium | FontAwesome icons | `@fortawesome/*` |
| 7 | Medium | react-hook-form for IntegrityEditForm | `react-hook-form` |
| 8 | Medium | Reflection submit mutation + UX feedback | — |
| 9 | Low | Storybook setup + stories | `@storybook/*` |
| 10 | Low | Testing setup + test files | `vitest`, `@testing-library/*` |

**Estimated total new files**: ~20 (components, stories, tests, configs)  
**Estimated deleted files**: 4 (old PascalCase flat component files)  
**New npm dependencies**: 8 packages across 3 parts
