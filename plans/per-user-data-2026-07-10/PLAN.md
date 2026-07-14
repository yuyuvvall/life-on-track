# Per-User Data (Multi-Tenancy) — per-user-data-2026-07-10

## Goal

Every feature (tasks, expenses, integrity line, goals, budgets, cards, weekly reflections, voice commands) becomes unique per Clerk user. Today all rows are global — auth (added in [clerk-auth-2026-07-10](../clerk-auth-2026-07-10/PLAN.md)) gates *access*, but every signed-in user would still see the same shared data.

## Architecture decision

Two viable patterns (researched 2026-07-10):

### Option A — shared schema + `user_id` column (CHOSEN)
Every top-level table gets a `user_id TEXT` column holding the Clerk user id (`user_...`); every query filters on it. Industry default; PlanetScale, Clerk, and most guides recommend starting here and only graduating to heavier isolation under regulatory pressure.

### Option B — Turso database-per-user (rejected for now)
Turso's flagship pattern: one SQLite DB per user, created via Platform API; total isolation, no `WHERE user_id` foot-gun, free tier allows 500 DBs. Rejected because:
- Schema migrations must be scripted across N databases (Turso's Multi-DB Schemas feature is deprecated); this repo's migration story is inline `ALTER TABLE`s in `initializeDatabase()` — DB-per-user would force a full rewrite of the db layer and deploy pipeline.
- The server would need per-request connection routing + connection caching on an e2-micro.
- The app expects a handful of users (owner + maybe family), not thousands of tenants.
Revisit if the app becomes a real multi-tenant product.

## Design

### 1. Which tables get `user_id`

**Top-level (get `user_id TEXT` + index):** `tasks`, `work_logs`, `expenses`, `recurring_expenses`, `category_budgets`, `categories`, `tags` (if separate), `prepaid_cards`, `goals`, `weekly_reflections`, `voice_commands`.

**Child tables (NO user_id — scoped through their parent):** `subtasks` (→tasks), `goal_relations`/`goal_logs` (→goals), `expense_tags` (→expenses), `card_loads`/`card_payment_allocations` (→prepaid_cards), `expense_repayments` (→expenses). Child routes already join to the parent; the parent's `user_id` filter carries over. One column of truth per entity avoids denormalized drift.

SQLite can't add a `NOT NULL` column without a table rebuild, so: add as nullable, backfill, enforce non-null **in code** (all inserts must set it, all selects must filter it). Optional later hardening: table rebuild with `NOT NULL` + `CHECK`.

### 2. Server plumbing

- `requireAuth` middleware already runs `getAuth(req)`; extend it to stash the id: `res.locals.userId = userId` (or a typed `getUserId(req)` helper in `server/src/middleware/auth.ts` that throws if absent — single source of truth).
- **Every route handler** in `tasks.ts`, `workLogs.ts`, `expenses.ts`, `recurringExpenses.ts`, `budgets.ts`, `tags.ts`, `categories.ts`, `cards.ts`, `goals.ts`, `weekly.ts`, `logs.ts`:
  - SELECT/UPDATE/DELETE: add `AND user_id = ?` (top-level) or join through the parent (children). 404, not 403, when the row belongs to someone else (don't leak existence).
  - INSERT: set `user_id` from the helper.
- **The biggest risk is one missed WHERE clause.** Mitigations:
  - Grep sweep at the end: every `FROM <top-level-table>` / `UPDATE` / `DELETE` statement must reference `user_id` — reviewable mechanically.
  - Two-user integration test (below).

### 3. Voice endpoint (`/api/voice/command`)

X-Api-Key is machine-to-machine with no user context. Map key → user: replace the single `VOICE_API_KEY` check with a `voice_api_keys(key TEXT PRIMARY KEY, user_id TEXT NOT NULL)` table (keep env-var key working as a fallback mapped to `VOICE_DEFAULT_USER_ID`). Minimal v1: keep `VOICE_API_KEY` + new `VOICE_USER_ID` env var; rows created by voice get that user id.

### 4. Per-user defaults

`initializeDatabase()` seeds global categories. Per-user categories need per-user seeding: on first authenticated request (or first `GET /api/categories` returning empty), seed the default set for that user. Decide: keep categories global (shared taxonomy, simpler) vs per-user (full isolation). **Recommendation: per-user**, seeded lazily, since users will want to customize.

### 5. No local users table (for now)

Clerk is the source of truth; the `user_id` string is enough. If we later need display names/emails in queries or Clerk-webhook-driven cleanup (delete user → purge rows), add a `users` mirror table + Clerk webhook then.

### 6. Client changes

Almost none — the API shape is unchanged; data just comes back filtered. React Query caches are keyed per endpoint and the whole tree remounts on sign-in change, but add `queryClient.clear()` on sign-out (in the auth-gate) so user A's cached data never flashes for user B on a shared device.

## Migration of existing data (owner backfill)

> Owner's production Clerk user id (provided 2026-07-10): `user_3GJXlhZWXmxOe4DDUSx90PVoR3J` — use as `MIGRATE_OWNER_USER_ID` at deploy time.

1. Deploy current auth build → sign up in production → copy your Clerk user id (`user_...`) from the Clerk dashboard (Users page).
2. Migration adds the columns (idempotent `ALTER TABLE ... ADD COLUMN user_id TEXT` in `initializeDatabase()`, matching the existing migration style) + `CREATE INDEX IF NOT EXISTS idx_<table>_user ON <table>(user_id)`.
3. Backfill script (one-off, run with `MIGRATE_OWNER_USER_ID` env var): `UPDATE <each top-level table> SET user_id = ? WHERE user_id IS NULL`.
4. Verify: `SELECT COUNT(*) FROM <table> WHERE user_id IS NULL` = 0 everywhere.
5. Take a Turso snapshot/dump **before** the backfill (Turso supports point-in-time restore; also `turso db shell ... .dump > backup.sql`).

## Rollout order

1. **Deploy what exists now** (see below) — auth gate live, sign up, grab owner user id.
2. Implement schema migration + backfill (guarded by env var so it's a no-op until the id is provided).
3. Implement route scoping (the big sweep) + voice user mapping + per-user category seeding.
4. Two-user integration test: user A creates a task/expense/goal; user B must see empty lists and get 404 on A's ids (test with two Clerk dev-instance users via testing tokens, or direct SQL assertions).
5. Deploy; verify owner sees all historical data, a second test account sees nothing.

## Should we deploy current state first? — YES

- The auth gate is already committed and independently valuable: it closes the currently **public** production API today.
- The backfill needs your **production** Clerk user id, which only exists after you sign up on the production instance — so deploying first is actually a prerequisite, not just convenient.
- Before deploying: enable **Restricted mode** (or allowlist) in the Clerk dashboard so nobody else can register, add live keys to Secret Manager + Vercel per [clerk-auth-2026-07-10](../clerk-auth-2026-07-10/PLAN.md).
- Until phase 2 ships, restricted sign-ups are also the only thing preventing another signed-in user from seeing your data — keep sign-ups locked until per-user scoping is deployed.

## Sources

- Clerk multi-tenant architecture: https://clerk.com/docs/guides/how-clerk-works/multi-tenant-architecture
- PlanetScale, approaches to tenancy: https://planetscale.com/blog/approaches-to-tenancy-in-postgres
- Turso database-per-tenant: https://turso.tech/multi-tenancy and https://turso.tech/blog/give-each-of-your-users-their-own-sqlite-database-b74445f4
- Turso + Clerk per-user DBs: https://turso.tech/blog/working-with-clerk-and-per-user-databases
- Shared vs per-tenant tradeoffs (2026): https://dev.to/young_gao/multi-tenant-architecture-database-per-tenant-vs-shared-schema-1n2e
