# Date Calculations Research

## 1. Week Start/End Calculations

### 1.1 `getWeekStart()` — `server/src/db/index.ts:195-201`

```ts
export const getWeekStart = (date?: Date): string => {
  const d = date || new Date();
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const diff = d.getDate() - day;
  const sunday = new Date(d.setDate(diff));
  return sunday.toISOString().split('T')[0];
};
```

**Analysis:**
- `d.getDay()` returns `0` for Sunday, `1` for Monday, ..., `6` for Saturday.
- `diff = d.getDate() - day` subtracts the day-of-week index from the day-of-month. Since Sunday is `0`, this goes back exactly to **Sunday**.
- Example: If today is Wednesday Feb 19 (day=3), diff = 19 - 3 = 16, which is Sunday Feb 16.
- Example: If today is Sunday Feb 22 (day=0), diff = 22 - 0 = 22, stays on Sunday Feb 22.
- **Conclusion: `getWeekStart()` returns SUNDAY as the start of the week.**

### 1.2 `getWeekEnd()` — `server/src/db/index.ts:204-208`

```ts
export const getWeekEnd = (weekStart: string): string => {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
};
```

- Takes the week start (Sunday) and adds 6 days.
- **Conclusion: `getWeekEnd()` returns SATURDAY as the end of the week.**
- Server-side week range is **Sunday through Saturday**.

### 1.3 `getWeekDays()` — `client/src/components/WeeklyCalendarView.tsx:16-30`

```ts
function getWeekDays(): Date[] {
  const today = new Date();
  const currentDay = today.getDay(); // 0 = Sunday
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - currentDay);
  weekStart.setHours(0, 0, 0, 0);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    days.push(day);
  }
  return days;
}
```

- Same logic: `today.getDate() - currentDay` goes back to Sunday.
- Generates 7 days: Sun, Mon, Tue, Wed, Thu, Fri, Sat.
- Day names array confirms this: `const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']`
- **Conclusion: Client-side calendar view also starts the week on SUNDAY.** Consistent with server.

### 1.4 Recurring expenses day-of-week — `server/src/routes/recurringExpenses.ts:271`

```ts
const dayOfWeek = (today.getDay() + 6) % 7; // Convert to Mon=0, Sun=6
```

- This converts the JS `getDay()` result (Sun=0) to a **Monday-first** scheme (Mon=0, Tue=1, ..., Sun=6).
- Used to match against `recurring.recurrence_day` for weekly recurring expenses.
- **Conclusion: Recurring expenses use a MONDAY=0 convention.** This is a separate convention from the rest of the app. It means recurring expenses think of the week as starting on Monday.

---

## 2. All Usages of `getWeekStart()` — Full Code Path Trace

### 2.1 `GET /weekly-summary` — `server/src/routes/weekly.ts:29-93`

**Entry point:** `router.get('/', ...)`

```ts
const weekStart = (req.query.weekStart as string) || getWeekStart();
const weekEnd = getWeekEnd(weekStart);
```

- If the client provides a `weekStart` query parameter, it uses that. Otherwise falls back to `getWeekStart()` (Sunday of current week).
- `weekEnd` = Saturday of that week.
- Queries work_logs with `WHERE log_date BETWEEN weekStart AND weekEnd` (Sunday–Saturday).
- Queries expenses with `WHERE DATE(created_at) BETWEEN weekStart AND weekEnd` (Sunday–Saturday).
- Returns a `WeeklySummary` object containing `weekStart`, `weekEnd`, work logs, expenses, etc.

**Client call chain:**
1. `ClosingEventView.tsx:308` calls `useWeeklySummary()` with no arguments.
2. `useWeeklySummary.ts:4-8` calls `weeklyApi.getSummary(weekStart)` — weekStart is undefined.
3. `client/src/api/client.ts:246-248` calls `GET /weekly-summary` with no query param.
4. Server defaults to `getWeekStart()` — **Sunday**.
5. Response comes back with `summary.weekStart` (Sunday) and `summary.weekEnd` (Saturday).
6. `ClosingEventView.tsx:371` displays `{summary.weekStart} → {summary.weekEnd}`.
7. `IntegrityHeatmap.tsx:9-15` receives `weekStart` and generates 7 days starting from it (Sunday through Saturday).
8. IntegrityHeatmap day labels: `['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']` — consistent with Sunday start.

### 2.2 `POST /weekly-summary/reflection` — `server/src/routes/weekly.ts:132-143`

```ts
args: [getWeekStart(), reflection]
```

- Stores the reflection with `week_start = getWeekStart()` — the current **Sunday**.
- No client override here — always uses the server-computed Sunday.

### 2.3 Goal frequency tracking — `server/src/routes/goals.ts`

`getWeekStart()` is used in **three places**, all with the same pattern:

**a) POST `/:id/logs` (line 392-393) — Creating a goal log:**
```ts
const periodStart = goal.frequency_period === 'weekly' 
  ? getWeekStart() 
  : goal.frequency_period === 'monthly'
    ? new Date().toISOString().slice(0, 7) + '-01'
    : date;
```
- For weekly frequency goals, `periodStart` = Sunday of current week.
- Counts logs from `periodStart` onwards with `WHERE goal_id = ? AND log_date >= ? AND value = 1`.
- Updates `current_value` on the goal to this count.

**b) PUT `/:id/logs/:logId` (line 539-540) — Editing a goal log:**
- Same pattern. After editing a log, recalculates the frequency count from Sunday.

**c) GET `/:id/stats` (line 657-658) — Getting goal statistics:**
- Same pattern. Filters `periodLogs` where `log_date >= periodStart` for display.

**Key observation:** All three use `>=` (greater-than-or-equal) with the Sunday date. This means the week period for frequency goals is **Sunday (inclusive) through the present day**. There is no upper bound explicitly set (it counts all logs from Sunday onward).

---

## 3. Month Start/End Calculations

### 3.1 `getCalendarDays()` — `client/src/views/ExpenseQuickAdd.tsx:564-588`

```ts
const getCalendarDays = () => {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;
  
  const days: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(i);
  }
  return days;
};
```

**Analysis of month boundaries:**
- `new Date(year, month, 1)` — First day of the month. Correct.
- `new Date(year, month + 1, 0)` — Day 0 of the next month, which JavaScript resolves to the **last day of the current month**. This is correct and covers all days.
- Example: For February 2026, `new Date(2026, 2, 0)` = Feb 28, 2026.
- The loop `for (let i = 1; i <= lastDay.getDate(); i++)` iterates from day 1 through the last day of the month. **This covers the full month.**

**Analysis of week start for the calendar grid:**
- `startDay = firstDay.getDay() - 1` — Subtracts 1 from the JS day index to shift from Sunday-first to **Monday-first**.
  - If the month starts on Monday (getDay()=1): startDay = 0 → no padding.
  - If the month starts on Sunday (getDay()=0): startDay = -1 → wrapped to 6 → six empty cells before Sunday.
  - If the month starts on Saturday (getDay()=6): startDay = 5 → five empty cells.
- **Conclusion: The ExpenseQuickAdd calendar grid starts weeks on MONDAY.**

**Does it cover the full month?**  
Yes. The loop runs from `1` to `lastDay.getDate()` (inclusive), which covers every day of the month. The `null` padding before is only for visual alignment in the calendar grid.

### 3.2 Monthly period start for goals — `server/src/routes/goals.ts`

```ts
goal.frequency_period === 'monthly'
  ? new Date().toISOString().slice(0, 7) + '-01'
```

- Takes today's ISO date (e.g., `"2026-02-22T..."`), slices to `"2026-02"`, then appends `"-01"`.
- Result: `"2026-02-01"` — the first day of the current month.
- Used as `periodStart` in `WHERE log_date >= ?` — counts from the 1st of the month onward.
- **Conclusion: Month start is always the 1st. Correct.**

### 3.3 End-of-month handling in recurring expenses — `server/src/routes/recurringExpenses.ts:291`

```ts
const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
const effectiveDay = Math.min(recurring.recurrence_day, lastDayOfMonth);
shouldGenerate = dayOfMonth === effectiveDay;
```

- Calculates the last day of the current month using `new Date(year, month+1, 0)`.
- If a recurring expense is set to day 31 but the month only has 28/30 days, it clamps to the last day.
- **Conclusion: Handles month-end edge cases correctly.**

---

## 4. Summary of Inconsistencies

| Location | Week starts on | Convention |
|---|---|---|
| `getWeekStart()` (server/db) | **Sunday** | Sun=0 from JS `getDay()` |
| `getWeekEnd()` (server/db) | ends **Saturday** | weekStart + 6 |
| `WeeklyCalendarView` (client) | **Sunday** | Same as `getWeekStart` |
| `IntegrityHeatmap` (client) | **Sunday** | Day labels start with 'Sun' |
| `ExpenseQuickAdd` calendar (client) | **Monday** | `getDay() - 1` adjustment |
| `recurringExpenses` day matching (server) | **Monday** = 0 | `(getDay() + 6) % 7` |

**Key inconsistency:** The week concept is split:
- The weekly summary, calendar view, heatmap, goals frequency tracking, and reflections all use **Sunday** as week start.
- The expense calendar picker and recurring expense day matching use **Monday** as week start.

| Location | Month start | Month end |
|---|---|---|
| `ExpenseQuickAdd` calendar | 1st of month | `new Date(y, m+1, 0)` — last day ✓ |
| Goals monthly period | 1st of month (`slice(0,7) + '-01'`) | No explicit end (counts from 1st onward) |
| Recurring expenses | N/A (uses day-of-month matching) | `new Date(y, m+1, 0).getDate()` for clamping ✓ |

Month calculations are consistent — all use the 1st as start and correctly compute the last day when needed.

---

## 5. Bug: Stale `current_value` for Frequency Goals on the Summary Screen

### Problem

On the **Goals Tracker** summary screen (`GoalsSummaryView`), a weekly frequency goal with a single log from January 12th still shows **1/4** progress. On the **Goal Detail** screen (`GoalDetailView`), the same goal correctly shows **0/4**.

### Root Cause

The two screens use **different data sources** for the frequency progress display:

| Screen | Data source | How progress is determined |
|---|---|---|
| Goals Tracker (`GoalsSummaryView`) | `GET /goals` → `goal.currentValue` | Reads `current_value` column directly from the DB |
| Goal Detail (`GoalDetailView`) | `GET /goals/:id/stats` → `periodProgress` | **Recalculates on the fly** by filtering logs within the current period |

**The `current_value` column in the `goals` table is a cached/denormalized value.** It is only updated at the moment a log is created or edited (in `POST /:id/logs` and `PUT /:id/logs/:logId` in `server/src/routes/goals.ts`). It is **never recalculated when the week rolls over**.

Here's what happened:
1. On January 12th, the user logged their frequency goal (value=1).
2. The server ran `getWeekStart()` which returned `"2025-01-12"` (a Sunday — the start of that week).
3. It counted logs from `"2025-01-12"` onwards with `value = 1` → found 1 log.
4. It set `current_value = 1` on the goal row in the database.
5. The week changed. No new logs were created. **Nobody recalculated `current_value`.**
6. Now it's February 2026. `current_value` in the DB is still `1` (stale from January 12th).

### Code Trace: GoalsSummaryView (shows WRONG 1/4)

1. `GoalsSummaryView` (`client/src/views/GoalsSummaryView.tsx:8`) calls `useGoals()`.
2. `useGoals()` (`client/src/hooks/useGoals.ts:5`) calls `goalsApi.getAll()`.
3. `goalsApi.getAll()` (`client/src/api/client.ts:200`) calls `GET /goals`.
4. Server handler (`server/src/routes/goals.ts:25-39`) runs `SELECT g.* FROM goals g WHERE ...`.
5. Returns the raw `Goal` object via `goalRowToGoal()` — which maps `current_value` → `currentValue` as-is from the DB.
6. `GoalCard` (`client/src/components/GoalCard.tsx:22-28`) renders:
   ```ts
   label: `${goal.currentValue} / ${goal.targetValue} ...`
   ```
   This displays the **stale** `current_value` from the DB → shows **1/4**.

### Code Trace: GoalDetailView (shows CORRECT 0/4)

1. `GoalDetailView` (`client/src/views/GoalDetailView.tsx:149`) calls `useGoalStats(id)`.
2. `useGoalStats()` (`client/src/hooks/useGoals.ts:20`) calls `goalsApi.getStats(id)`.
3. `goalsApi.getStats()` (`client/src/api/client.ts:206`) calls `GET /goals/:id/stats`.
4. Server handler invokes `calculateGoalStats()` (`server/src/routes/goals.ts:610-707`).
5. For frequency goals (line 656-670):
   ```ts
   const periodStart = goal.frequency_period === 'weekly' 
     ? getWeekStart()    // Sunday of THIS week
     : ...
   const periodLogs = logs.filter(l => l.log_date >= periodStart && l.value === 1);
   periodProgress = { current: periodLogs.length, target: goal.target_value };
   ```
   This **recalculates** by filtering logs within the current week. The Jan 12th log is NOT >= this week's Sunday → `periodLogs.length = 0` → shows **0/4**.
6. `GoalDetailView` (line 296-300) renders:
   ```tsx
   {periodProgress.current} of {periodProgress.target} this {goal.frequencyPeriod}
   ```
   Displays the **freshly calculated** value → shows **0/4**.

### Why This Is a Problem

`current_value` is a write-time cache that becomes stale when the period (week/month) rolls over. The `GET /goals` list endpoint serves this stale value without recalculating it. The stats endpoint recalculates correctly but is only called for the detail view.

### Possible Fixes

1. **Recalculate on read:** Make the `GET /goals` endpoint recalculate `current_value` for frequency goals based on the current period (like the stats endpoint does).
2. **Scheduled recalculation:** Add a cron/scheduled job that resets `current_value` for frequency goals at the start of each period.
3. **Client-side fix:** Have the summary screen fetch stats per goal (expensive — N+1 queries).
4. **Remove the cached column:** Always compute progress from logs at query time.
