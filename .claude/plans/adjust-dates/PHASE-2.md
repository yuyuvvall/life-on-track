# Phase 2: Fix Stale `current_value` for Frequency Goals

## Overview

The `current_value` column in the `goals` table is a **write-time cache** for frequency goals. It is only updated when a log is created (`POST /:id/logs`) or edited (`PATCH /:id/logs/:logId`). When the period (week/month) rolls over without any new logs, the cached value becomes **stale**. Screens that read `goal.currentValue` directly from the DB display incorrect progress (e.g., 1/4 instead of 0/4).

---

## Bug Verification

### Root Cause (confirmed)

| Screen / Component | Data Source | Progress Display | Result |
|--------------------|-------------|------------------|--------|
| **GoalsSummaryView** → GoalCard | `GET /goals` | `goal.currentValue` from DB | **Stale** |
| **ClosingEventView** → GoalsProgress | `GET /weekly-summary` → `summary.goals` | `goal.currentValue` from DB | **Stale** |
| **PulseDashboard** → WeeklyStats | `GET /goals` | `goal.currentValue` from DB | **Stale** |
| **GoalDetailView** (main goal) | `GET /goals/:id/stats` → `periodProgress` | Recalculated from logs | **Correct** |
| **GoalDetailView** (sub-goals) | `GET /goals/:id/stats` → `subGoals` | `sg.currentValue` from DB | **Stale** (for frequency sub-goals) |

### Scenario (from REASERCH.md)

1. Jan 12th: User logs frequency goal (value=1). Server sets `current_value = 1`.
2. Week rolls over. No new logs.
3. Feb 2026: `current_value` in DB is still `1`. Summary shows **1/4**; Detail shows **0/4** (recalculated).

### Minor Corrections to REASERCH.md

- The log update endpoint is **PATCH** `/:goalId/logs/:logId`, not PUT.
- The bug also affects: **GoalsProgress** (ClosingEventView), **WeeklyStats** (PulseDashboard), and **sub-goals** in GoalDetailView — not only GoalsSummaryView.

---

## Affected Code Paths

| Endpoint | Returns goals with | Affects |
|----------|--------------------|---------|
| `GET /goals` | Raw `current_value` from DB | GoalsSummaryView, WeeklyStats |
| `GET /weekly-summary` | Raw `current_value` from DB | GoalsProgress (ClosingEventView) |
| `GET /goals/:id/stats` | Main goal: `periodProgress` (correct). Sub-goals: raw `current_value` (stale) | GoalDetailView main + sub-goals |

---

## Fix Strategy: Recalculate on Read

**Chosen approach:** Recalculate `current_value` for frequency goals at read time, using the same logic as `calculateGoalStats()`. This ensures consistency across all endpoints without cron jobs or N+1 client requests.

**Principles:**
1. **Single source of truth** — Extract period calculation into one shared helper.
2. **Efficient batching** — One extra query for logs when frequency goals exist; no per-goal queries.
3. **Minimal changes** — Keep write-time updates (POST/PATCH logs) as-is for immediate consistency.

---

## Implementation Plan

### Step 1: Extract Shared Helper for Period Start

**File:** `server/src/db/index.ts` (or `server/src/routes/goals.ts`)

Add a reusable function to compute `periodStart` for a frequency goal. This logic is duplicated in 4 places in `goals.ts` (lines 392–395, 539–543, 657–661).

```ts
// server/src/db/index.ts — add after getWeekEnd

/**
 * Returns the period start date for a frequency goal.
 * Used for counting logs within the current week/month.
 */
export const getPeriodStart = (
  frequencyPeriod: 'daily' | 'weekly' | 'monthly' | null,
  referenceDate?: Date
): string => {
  const d = referenceDate || new Date();
  const today = d.toISOString().split('T')[0];
  if (frequencyPeriod === 'weekly') {
    return getWeekStart(d);
  }
  if (frequencyPeriod === 'monthly') {
    return d.toISOString().slice(0, 7) + '-01';
  }
  return today; // daily or fallback
};
```

---

### Step 2: Extract Shared Helper for Frequency Progress

**File:** `server/src/routes/goals.ts`

Add a helper that computes the current period count from logs. Reuse in write handlers and read handlers.

```ts
// Add near the top, after imports

function getFrequencyPeriodCount(
  goal: GoalRow,
  logs: GoalLogRow[],
  referenceDate?: Date
): number {
  const periodStart = getPeriodStart(goal.frequency_period, referenceDate);
  return logs.filter(
    (l) => l.log_date >= periodStart && l.value === 1
  ).length;
}
```

**Update existing code** to use `getPeriodStart` and `getFrequencyPeriodCount`:

- `POST /:id/logs` (lines 392–406): Replace inline periodStart + COUNT query with `getFrequencyPeriodCount(goal, logs)` — but we need logs. Currently it uses a SQL COUNT. We can either:
  - Keep the SQL COUNT and use `getPeriodStart(goal.frequency_period)` for the `periodStart` variable, **or**
  - Fetch logs and use `getFrequencyPeriodCount`. The SQL approach is more efficient for write path.

**Recommendation:** Use `getPeriodStart` in all 4 places for consistency. For the COUNT query, pass `getPeriodStart(goal.frequency_period)` as the `periodStart` argument. The `getFrequencyPeriodCount` helper is for in-memory log arrays (stats, batch recalculation).

---

### Step 3: Add Batch Recalculation Helper

**File:** `server/src/routes/goals.ts`

Export this function so `weekly.ts` can import it (no circular dependency: goals does not import weekly).

```ts
/**
 * For each frequency goal in the list, fetches its logs and overwrites
 * current_value with the recalculated period count. Mutates goal objects.
 */
export async function recalculateFrequencyGoalsCurrentValue(
  goals: GoalRow[]
): Promise<void> {
  const frequencyGoals = goals.filter((g) => g.goal_type === 'frequency');
  if (frequencyGoals.length === 0) return;

  const ids = frequencyGoals.map((g) => g.id);
  const placeholders = ids.map(() => '?').join(',');
  const logsResult = await trackedExecute({
    sql: `SELECT goal_id, log_date, value FROM goal_logs 
          WHERE goal_id IN (${placeholders}) AND value = 1`,
    args: ids,
  }, 'getLogsForFrequencyGoals');
  const logs = logsResult.rows as unknown as { goal_id: string; log_date: string; value: number }[];

  const logsByGoal = new Map<string, { log_date: string; value: number }[]>();
  for (const row of logs) {
    const arr = logsByGoal.get(row.goal_id) || [];
    arr.push({ log_date: row.log_date, value: row.value });
    logsByGoal.set(row.goal_id, arr);
  }

  const now = new Date();
  for (const goal of frequencyGoals) {
    const goalLogs = logsByGoal.get(goal.id) || [];
    const periodStart = getPeriodStart(goal.frequency_period, now);
    const count = goalLogs.filter((l) => l.log_date >= periodStart).length;
    goal.current_value = count;
  }
}
```

**Note:** Use `GoalLogRow`-shaped objects if your types require it. The important part is `log_date` and `value`.

---

### Step 4: Update `GET /goals`

**File:** `server/src/routes/goals.ts`

```ts
// In router.get('/', ...) — after fetching goals (top-level only)

const goals = result.rows as unknown as GoalRow[];
await recalculateFrequencyGoalsCurrentValue(goals);
res.json(goals.map(goalRowToGoal));
```

---

### Step 5: Update `GET /weekly-summary`

**File:** `server/src/routes/weekly.ts`

```ts
// After: const goals = goalsResult.rows as unknown as GoalRow[];

import { recalculateFrequencyGoalsCurrentValue } from './goals.js'; // or export the helper

// ...
const goals = goalsResult.rows as unknown as GoalRow[];
await recalculateFrequencyGoalsCurrentValue(goals);

const summary: WeeklySummary = {
  // ...
  goals: goals.map(goalRowToGoal),
  // ...
};
```

**Alternative:** Export `recalculateFrequencyGoalsCurrentValue` from `goals.ts` and import it in `weekly.ts`. Avoid circular imports: if `goals` imports `weekly`, move the helper to a shared module (e.g. `server/src/lib/goalUtils.ts`).

---

### Step 6: Update `GET /goals/:id/stats` — Sub-goals

**File:** `server/src/routes/goals.ts`

In the stats handler, after fetching `subGoals`:

```ts
const subGoals = subGoalsResult.rows as unknown as GoalRow[];
await recalculateFrequencyGoalsCurrentValue(subGoals);

const stats = calculateGoalStats(goal, logs, subGoals);
```

`calculateGoalStats` uses `sg.currentValue` for `subGoalsCompleted` (line 624–626). After recalculation, `goalRowToGoal(sg)` will map the updated `current_value` to `currentValue`, so sub-goals will show correct progress.

---

### Step 7: Refactor Write Handlers to Use `getPeriodStart`

**File:** `server/src/routes/goals.ts`

**POST `/:id/logs` (lines 392–395):**

```ts
const periodStart = getPeriodStart(goal.frequency_period);
```

**PATCH `/:goalId/logs/:logId` (lines 539–543):**

```ts
const periodStart = getPeriodStart(goal.frequency_period);
```

**`calculateGoalStats` (lines 657–661):**

```ts
const periodStart = getPeriodStart(goal.frequency_period);
const periodLogs = logs.filter(l => l.log_date >= periodStart && l.value === 1);
```

---

## File Structure Summary

| File | Changes |
|------|---------|
| `server/src/db/index.ts` | Add `getPeriodStart()` |
| `server/src/routes/goals.ts` | Add `recalculateFrequencyGoalsCurrentValue()`, use `getPeriodStart` in 4 places, call recalculation in `GET /` and `GET /:id/stats` |
| `server/src/routes/weekly.ts` | Import and call `recalculateFrequencyGoalsCurrentValue` before mapping goals |

---

## Avoiding Circular Imports

If `weekly.ts` cannot import from `goals.ts` (e.g. goals imports weekly), create:

**File:** `server/src/lib/goalUtils.ts`

```ts
import { getPeriodStart } from '../db/index.js';
import { trackedExecute } from '../db/index.js';
import type { GoalRow } from '../types.js';

export async function recalculateFrequencyGoalsCurrentValue(
  goals: GoalRow[]
): Promise<void> {
  // ... (same implementation as above)
}
```

Then both `goals.ts` and `weekly.ts` import from `goalUtils.ts`.

---

## Efficiency

- **GET /goals:** One extra query only when there are frequency goals: `SELECT ... FROM goal_logs WHERE goal_id IN (...) AND value = 1`. Single batch.
- **GET /weekly-summary:** Same pattern.
- **GET /goals/:id/stats:** One extra query for sub-goal logs when the parent has frequency sub-goals.
- **No N+1:** All logs for affected goals fetched in one query.
- **Write path unchanged:** POST/PATCH still update `current_value` immediately; read path corrects for period rollover.

---

## Testing Checklist

- [ ] GoalsSummaryView: Frequency goal with old log shows 0/4 after week rollover.
- [ ] GoalDetailView: Main goal still shows correct period progress.
- [ ] GoalDetailView: Frequency sub-goals show correct period progress.
- [ ] ClosingEventView (GoalsProgress): Frequency goals show correct progress.
- [ ] PulseDashboard (WeeklyStats): Frequency goals show correct progress.
- [ ] Logging a new entry updates progress immediately on all screens.
- [ ] Monthly frequency goals: same behavior across month boundary.

---

## Code Snippets Reference

### getPeriodStart (db/index.ts)

```ts
export const getPeriodStart = (
  frequencyPeriod: 'daily' | 'weekly' | 'monthly' | null,
  referenceDate?: Date
): string => {
  const d = referenceDate || new Date();
  const today = d.toISOString().split('T')[0];
  if (frequencyPeriod === 'weekly') return getWeekStart(d);
  if (frequencyPeriod === 'monthly') return d.toISOString().slice(0, 7) + '-01';
  return today;
};
```

### recalculateFrequencyGoalsCurrentValue (goalUtils.ts or goals.ts)

```ts
async function recalculateFrequencyGoalsCurrentValue(goals: GoalRow[]): Promise<void> {
  const frequencyGoals = goals.filter((g) => g.goal_type === 'frequency');
  if (frequencyGoals.length === 0) return;

  const ids = frequencyGoals.map((g) => g.id);
  const placeholders = ids.map(() => '?').join(',');
  const logsResult = await trackedExecute({
    sql: `SELECT goal_id, log_date, value FROM goal_logs 
          WHERE goal_id IN (${placeholders}) AND value = 1`,
    args: ids,
  }, 'getLogsForFrequencyGoals');
  const rows = logsResult.rows as { goal_id: string; log_date: string; value: number }[];

  const byGoal = new Map<string, { log_date: string; value: number }[]>();
  for (const r of rows) {
    const arr = byGoal.get(r.goal_id) ?? [];
    arr.push({ log_date: r.log_date, value: r.value });
    byGoal.set(r.goal_id, arr);
  }

  const now = new Date();
  for (const goal of frequencyGoals) {
    const logs = byGoal.get(goal.id) ?? [];
    const periodStart = getPeriodStart(goal.frequency_period, now);
    goal.current_value = logs.filter((l) => l.log_date >= periodStart).length;
  }
}
```
