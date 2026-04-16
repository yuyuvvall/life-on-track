# ClosingEventView — Deep Research

## 1. Overview

`ClosingEventView` is the **Weekly Closing Event** page, routed at `/weekly` in `App.tsx`. It serves as a **weekly review dashboard** combining a data audit panel (integrity heatmap, spending breakdown, goals progress, quick stats) with a free-form markdown reflection editor. The purpose is to let the user review their week, inspect each day's integrity logs, and write a structured reflection.

---

## 2. File Map

| File | Role |
|---|---|
| `client/src/views/ClosingEventView.tsx` | Main view — 524 lines, contains 5 components (1 exported, 4 internal) |
| `client/src/hooks/useWeeklySummary.ts` | React Query hook fetching `WeeklySummary` from API |
| `client/src/hooks/useWorkLogs.ts` | Exports `useUpdateWorkLog` mutation (PATCH work log, invalidate caches) |
| `client/src/hooks/useGoals.ts` | Exports `useLogGoalProgress`, `useGoalLogs` (used by `GoalsProgress`) |
| `client/src/components/IntegrityHeatmap.tsx` | 7-day integrity heatmap grid (71 lines) |
| `client/src/components/SpendingChart.tsx` | Horizontal bar chart of expenses by category (69 lines) |
| `client/src/components/GoalsProgress.tsx` | Goal list with progress bars, accordion logs, quick-log button (217 lines) |
| `client/src/api/client.ts` | HTTP client — `weeklyApi.getSummary()`, `weeklyApi.submitReflection()`, `workLogsApi.update()` |
| `client/src/types/index.ts` | TypeScript interfaces — `WorkLog`, `WeeklySummary`, `Goal`, `GoalLog`, etc. |
| `client/src/utils/dateConstants.ts` | `WEEK_DAY_NAMES` — `['Sun','Mon','Tue','Wed','Thu','Fri','Sat']` |
| `client/src/index.css` | Global styles: `.heatmap-*`, `.btn-*`, `.markdown-content`, `.integrity-btn-*` |
| `client/tailwind.config.js` | Custom theme: `surface-{500..900}`, `accent-{green,red,blue,amber}`, fonts |
| `server/src/routes/weekly.ts` | Express handler: `GET /weekly-summary`, `POST /weekly-summary/reflection` |

---

## 3. Component Tree

```
ClosingEventView (exported)
├── <header> — sticky bar with title, week range, integrity rate %
├── Left Pane: "Data Audit"
│   ├── IntegrityHeatmap (imported component)
│   │   └── 7 day cells: green/red/empty, clickable
│   ├── DayNotesInline (internal, desktop only)
│   │   ├── DayNotesContent (view mode)
│   │   └── IntegrityEditForm (edit mode)
│   ├── SpendingChart (imported component)
│   ├── GoalsProgress (imported component)
│   │   └── GoalItem (internal to GoalsProgress, accordion with logs)
│   └── Quick Stats grid (Total Expenses, Days Logged)
├── Right Pane: "Weekly Reflection"
│   ├── Template hint + "Use Template" button
│   ├── Markdown textarea (edit mode)
│   ├── ReactMarkdown preview (preview mode)
│   └── Submit button + character count
└── DayNotesModal (internal, mobile only, overlay)
    ├── DayNotesContent (view mode)
    └── IntegrityEditForm (edit mode)
```

---

## 4. Internal Components (defined in ClosingEventView.tsx)

### 4.1 `DayNotesContent` (lines 11–43)
- **Props**: `{ log: WorkLog }`
- **Purpose**: Read-only display of a single day's notes
- **Renders**: Two sections — "What went well" (green accent, left border) and "What could improve" (red accent, left border). Falls back to italic "No notes recorded" if null.

### 4.2 `IntegrityEditForm` (lines 46–141)
- **Props**: `{ log: WorkLog; onSave: (data) => void; onCancel: () => void; isPending: boolean }`
- **State**: `score` (0 | 1), `successNote` (string), `missedNote` (string) — initialized from `log`
- **Renders**: Score toggle (two buttons: "✓ Success" green / "✗ Missed" red), two textareas for notes, Cancel + Save buttons. Disables save while `isPending`.
- **Behavior**: On submit, calls `onSave` with the current form values. Empty strings are coerced to `undefined`.

### 4.3 `DayNotesModal` (lines 144–226)
- **Props**: `{ log: WorkLog | null; date: string; onClose: () => void }`
- **State**: `isEditing` (boolean)
- **Uses**: `useUpdateWorkLog()` mutation
- **Purpose**: Full-screen overlay for **mobile** users. Shows formatted date, integrity status icon, edit button. Toggles between `DayNotesContent` and `IntegrityEditForm`. Closes on backdrop click or after save success.

### 4.4 `DayNotesInline` (lines 229–305)
- **Props**: `{ log: WorkLog | null; date: string; onClose: () => void }`
- **State**: `isEditing` (boolean)
- **Uses**: `useUpdateWorkLog()` mutation
- **Purpose**: Inline panel for **desktop** users. Appears below the heatmap with a slide-in animation (`animate-in slide-in-from-top-2`). Has close (×) and edit (✎) buttons. Same toggle between view and edit mode as the modal.

---

## 5. Main Component: `ClosingEventView` (lines 307–522)

### 5.1 State

| State Variable | Type | Purpose |
|---|---|---|
| `summary` | `WeeklySummary \| undefined` | Fetched via `useWeeklySummary()` |
| `reflection` | `string` | Content of the markdown reflection editor |
| `showPreview` | `boolean` | Toggle between edit and markdown preview |
| `selectedDay` | `{ log: WorkLog \| null; date: string } \| null` | Currently selected day in heatmap |
| `isMobile` | `boolean` | Whether viewport width < 1024px |

### 5.2 Effects & Memos

- **`useEffect` (lines 315–320)**: Resize listener that sets `isMobile` based on `window.innerWidth < 1024`. Matches Tailwind's `lg:` breakpoint. Runs on mount, cleans up listener on unmount.

- **`useMemo` — `autoPopulatedContent` (lines 323–332)**: Builds a markdown string from `summary.missedOpportunityNotes`. Format:
  ```
  ## Missed Opportunities This Week

  1. <note>
  2. <note>

  ## Points to Improve

  - 
  ```
  Returns empty string if no missed notes exist. Dependency: `[summary]`.

- **`useState(() => {...})` (lines 335–339)**: **BUG** — This uses `useState`'s initializer as if it were `useEffect`. The initializer runs only once during the first render, its return value (void) is discarded, and it never re-runs when `autoPopulatedContent` changes. This is effectively **dead code** — the auto-populated content is never automatically set into the reflection state. The "Use Template" button (`handleUseTemplate`) is the only working path to populate it.

### 5.3 Handlers

- **`handleUseTemplate` (line 341)**: Sets `reflection` to the `autoPopulatedContent` string. This is the working alternative to the broken auto-populate logic.

### 5.4 Loading / Empty States

- **Loading** (lines 345–351): Full-screen centered "Loading weekly data..." text.
- **No data** (lines 353–359): Full-screen centered "No data available" text.

### 5.5 Layout

Two-pane layout using `lg:flex`:
- **Left pane** (`lg:w-1/2`): Data audit — scrollable, bordered on right at desktop.
- **Right pane** (`lg:w-1/2`): Reflection editor — scrollable.
- Height calc: `lg:h-[calc(100vh-80px)]` to fill viewport below the 80px header.
- On mobile: panes stack vertically (no flex row).

### 5.6 Header (lines 364–381)

- Sticky top, semi-transparent background with blur (`bg-surface-900/95 backdrop-blur-sm`).
- Left side: "Weekly Closing Event" title + week range in monospace (`{weekStart} → {weekEnd}`).
- Right side: Large integrity rate percentage + "Integrity Rate" label.

### 5.7 Left Pane Features

#### Integrity Heatmap (lines 392–403)
- Passes `workLogs`, `weekStart`, and an `onDayClick` callback.
- Click toggles selection: clicking the same day deselects, clicking a different day selects it.
- The heatmap component generates 7 days from `weekStart`, renders cells with:
  - Color: green (score=1), red (score=0), gray (no log)
  - Today indicator: blue ring
  - Notes indicator: white/30 ring
  - Clickable cells scale on hover

#### Day Notes — Desktop (lines 406–412)
- Renders `DayNotesInline` below heatmap when `!isMobile && selectedDay`.
- Inline panel with edit capability.

#### Spending Chart (lines 415–418)
- `SpendingChart` receives `expensesByCategory` (Record<string, number>) and `totalExpenses`.
- Renders sorted horizontal bars with category colors: Food=#f59e0b, Transport=#3b82f6, Entertainment=#a855f7, Shopping=#ec4899, Bills=#ef4444, Health=#22c55e, Other=#6b7280.
- Empty state: "No expenses this week".
- Bar width is relative to the max category amount (not total).

#### Goals Progress (lines 420–421)
- `GoalsProgress` receives `goals: Goal[]`.
- Displays up to 4 goals. Each `GoalItem` has:
  - Title linking to `/goals/:id`
  - Progress bar (green when complete, blue for reading, amber for frequency/numeric)
  - Quick-log "+" button for frequency goals
  - Accordion toggle showing recent logs (fetched lazily via `useGoalLogs` only when expanded)
- "+N more goals" link to `/goals` when > 4 goals.
- Empty state with "Add Goals" link.

#### Quick Stats (lines 424–437)
- 2-column grid:
  - **Total Expenses**: monospace, dollar-formatted
  - **Days Logged**: `n/7` (counts logs with non-null integrity score)

### 5.8 Right Pane Features

#### Template System (lines 446–474)
- "Use Template" button appears when `autoPopulatedContent` exists AND `reflection` is empty.
- Amber-accented hint box shows count of missed opportunity notes and instructions.

#### Editor / Preview Toggle (lines 476–501)
- **Edit mode**: Full-height textarea with monospace font, placeholder showing suggested markdown structure.
- **Preview mode**: `ReactMarkdown` rendering inside a styled div with `.markdown-content` class (global CSS provides heading, list, code, blockquote styles).

#### Submit + Character Count (lines 505–508)
- "Submit Reflection" button calls `weeklyApi.submitReflection(reflection)` — POSTs to `/weekly-summary/reflection` which INSERTs into `weekly_reflections` table.
- Character count display on the right.

#### Day Notes — Mobile (lines 513–519)
- Renders `DayNotesModal` when `isMobile && selectedDay`.
- Full-screen overlay with backdrop click to close.

---

## 6. Data Flow

### 6.1 Fetching
```
useWeeklySummary() 
  → weeklyApi.getSummary() 
    → GET /api/weekly-summary?weekStart=...
      → Server queries: work_logs, expenses, goals tables
      → Calculates: expensesByCategory, totalExpenses, integrityRate, missedOpportunityNotes
      → Returns WeeklySummary object
```

### 6.2 Updating a Work Log (editing integrity from the view)
```
IntegrityEditForm.onSave()
  → DayNotesModal.handleSave() or DayNotesInline.handleSave()
    → useUpdateWorkLog().mutate({ id, data })
      → workLogsApi.update(id, data) 
        → PATCH /api/work-logs/:id
      → onSuccess: invalidates ['workLogs'] and ['weeklySummary'] query caches
```

### 6.3 Submitting Reflection
```
Submit button onClick
  → weeklyApi.submitReflection(reflection)
    → POST /api/weekly-summary/reflection { reflection }
      → Server INSERTs into weekly_reflections(week_start, reflection_text)
```

### 6.4 Quick-logging Goal Progress (from GoalsProgress)
```
GoalItem "+" button
  → GoalsProgress.handleQuickLog()
    → useLogGoalProgress().mutate({ id: goal.id, data: { value: 1 } })
      → POST /api/goals/:id/logs { value: 1 }
      → onSuccess: invalidates ['goals'], ['goals', id], ['weeklySummary']
```

---

## 7. Type Definitions (relevant subset)

### WorkLog
```typescript
interface WorkLog {
  id: number;
  logDate: string;             // "YYYY-MM-DD"
  integrityScore: 0 | 1 | null;
  missedOpportunityNote: string | null;
  successNote: string | null;
  createdAt: string;
}
```

### WeeklySummary
```typescript
interface WeeklySummary {
  weekStart: string;            // "YYYY-MM-DD"
  weekEnd: string;              // "YYYY-MM-DD"
  workLogs: WorkLog[];
  expenses: Expense[];
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  integrityRate: number;        // 0–100, rounded
  goals: Goal[];
  missedOpportunityNotes: string[];  // from days with score=0
}
```

### Goal (fields used by GoalsProgress)
```typescript
interface Goal {
  id: string;
  title: string;
  goalType: 'reading' | 'frequency' | 'numeric';
  targetValue: number;
  currentValue: number;
  totalPages: number | null;
  currentPage: number;
  unit: string;
  // ...more fields
}
```

---

## 8. Design System

### Color Palette (from tailwind.config.js)
| Token | Hex | Usage |
|---|---|---|
| `surface-900` | `#0a0a0a` | Page background |
| `surface-800` | `#121212` | Modal background, scrollbar track |
| `surface-700` | `#1a1a1a` | Cards, input backgrounds, panels |
| `surface-600` | `#242424` | Empty heatmap cells, subtle backgrounds |
| `surface-500` | `#2e2e2e` | Borders, progress bar tracks |
| `accent-green` | `#22c55e` | Success states, integrity score=1 |
| `accent-red` | `#ef4444` | Failure states, integrity score=0 |
| `accent-blue` | `#3b82f6` | Primary actions, today indicator, reading goals |
| `accent-amber` | `#f59e0b` | Warnings, template hints, frequency goals |

### Typography
- **Sans**: Inter, system-ui
- **Mono**: JetBrains Mono, Fira Code — used for data values, code blocks, integrity rates
- **Base font size**: 14px (set on `<html>`)

### CSS Classes (from index.css)
- `.heatmap-cell`: 24×24px rounded squares, monospace text, flexbox centered
- `.heatmap-success`: green bg/text at 30% opacity
- `.heatmap-fail`: red bg/text at 30% opacity
- `.heatmap-empty`: surface-600 bg, gray-600 text
- `.btn`: compact button base (12px padding, rounded, medium font)
- `.btn-primary`: blue background
- `.btn-ghost`: transparent, gray text
- `.markdown-content`: styled headings (xl/lg/base), lists, code blocks, blockquotes

---

## 9. Responsive Behavior

| Aspect | Mobile (<1024px) | Desktop (≥1024px) |
|---|---|---|
| Layout | Stacked vertically | Side-by-side `lg:flex` |
| Pane width | Full width | 50/50 split |
| Pane height | Auto | `calc(100vh - 80px)` with overflow scroll |
| Day notes | Full-screen modal (DayNotesModal) | Inline panel below heatmap (DayNotesInline) |
| Detection | `useEffect` + resize listener | Same |

---

## 10. Known Issues

### BUG: Dead auto-populate code (lines 335–339)
```typescript
useState(() => {
  if (autoPopulatedContent && !reflection) {
    setReflection(autoPopulatedContent);
  }
});
```
`useState` is being misused as `useEffect`. The initializer:
1. Runs only on the **first render** — `autoPopulatedContent` is likely still `''` at that point because `summary` hasn't loaded yet.
2. Its return value (`undefined`) is discarded — `useState` expects an initial state value.
3. Calling `setReflection` inside `useState`'s initializer during render is a React anti-pattern.
4. It **never re-runs** when `autoPopulatedContent` changes (unlike `useEffect`).

**Result**: The auto-population never fires. Only the manual "Use Template" button works.

**Fix**: Replace with `useEffect`:
```typescript
useEffect(() => {
  if (autoPopulatedContent && !reflection) {
    setReflection(autoPopulatedContent);
  }
}, [autoPopulatedContent]);
```

### MINOR: No feedback on reflection submit
The "Submit Reflection" button calls `weeklyApi.submitReflection()` directly (not via a mutation), so there's no loading state, success feedback, or error handling visible to the user. The button doesn't disable during submission.

### MINOR: Reflection is not persisted locally
If the user writes a reflection and navigates away before submitting, the content is lost. There's no `localStorage` or draft persistence.

### MINOR: No loading of existing reflection
When the view loads, it doesn't fetch any previously submitted reflection for the current week. The textarea always starts empty.

---

## 11. Component Interaction Patterns

### Heatmap → Day Notes Flow
1. User clicks a heatmap cell in `IntegrityHeatmap`
2. `onDayClick` fires with `(log | null, dateString)`
3. `ClosingEventView` sets `selectedDay` state (or nulls it on re-click)
4. Based on `isMobile`, either `DayNotesModal` or `DayNotesInline` renders
5. Both can toggle into edit mode via `IntegrityEditForm`
6. On save, `useUpdateWorkLog` PATCHes the API and invalidates React Query caches
7. Summary re-fetches automatically, updating the heatmap

### Template → Reflection Flow
1. `useWeeklySummary` loads `missedOpportunityNotes`
2. `useMemo` builds `autoPopulatedContent` markdown string
3. If notes exist and reflection is empty, hint box + "Use Template" button appear
4. User clicks "Use Template" → `setReflection(autoPopulatedContent)`
5. User edits freely, toggles preview, then clicks "Submit Reflection"
6. `weeklyApi.submitReflection()` POSTs to server → stored in DB

---

## 12. Server-Side Details

### GET /weekly-summary
- Accepts optional `?weekStart=YYYY-MM-DD` (defaults to current week via `getWeekStart()`)
- Queries `work_logs` table for the date range
- Queries `expenses` table by `DATE(created_at)` in the range
- Queries `goals` table for active goals, then `recalculateFrequencyGoalsCurrentValue()`
- Aggregates: `expensesByCategory`, `totalExpenses`, `integrityRate`, `missedOpportunityNotes`
- Returns full `WeeklySummary` JSON

### POST /weekly-summary/reflection
- Accepts `{ reflection: string }` body
- Inserts into `weekly_reflections(week_start, reflection_text)` using server-determined `getWeekStart()`
- Returns `{ message: "Reflection submitted successfully" }`
- Note: Does an INSERT, not UPSERT — submitting multiple times for the same week creates duplicate rows (or may fail on a unique constraint depending on the schema)
