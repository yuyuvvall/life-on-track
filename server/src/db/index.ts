import { createClient, Client } from '@libsql/client';
import { createTrackedExecute, queryLoggerMiddleware, setCurrentEndpoint, clearCurrentEndpoint } from './queryLogger.js';

// Get database URL from environment
// Local: file:./data/auditor.db
// Turso: libsql://your-db.turso.io
const DATABASE_URL = process.env.DATABASE_URL || 'file:./data/auditor.db';
const DATABASE_AUTH_TOKEN = process.env.DATABASE_AUTH_TOKEN;

// Create database client
const db: Client = createClient({
  url: DATABASE_URL,
  authToken: DATABASE_AUTH_TOKEN,
});

// Schema embedded directly to avoid file system issues in production
const SCHEMA = `
-- 1. Goals Table
CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    goal_type TEXT DEFAULT 'frequency' CHECK (goal_type IN ('reading', 'frequency', 'numeric')),
    target_value INTEGER NOT NULL DEFAULT 0,
    unit TEXT,
    current_value INTEGER DEFAULT 0,
    total_pages INTEGER,
    current_page INTEGER DEFAULT 0,
    frequency_period TEXT CHECK (frequency_period IN ('daily', 'weekly', 'monthly')),
    start_date DATE DEFAULT CURRENT_DATE,
    target_date DATE,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals(parent_id);

-- 1a. Goal Relations (many-to-many junction table)
CREATE TABLE IF NOT EXISTS goal_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    child_goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    relation_type TEXT DEFAULT 'subgoal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parent_goal_id, child_goal_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_relations_parent ON goal_relations(parent_goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_relations_child ON goal_relations(child_goal_id);

-- 1b. Progress Logs for Goals
CREATE TABLE IF NOT EXISTS goal_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    log_date DATE NOT NULL,
    value INTEGER NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(goal_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_goal_logs_goal ON goal_logs(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_logs_date ON goal_logs(log_date);

-- 2. Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'Personal' CHECK (category IN ('Work', 'Admin', 'Personal')),
    deadline DATETIME,
    scheduled_complete_date TEXT,
    is_completed BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. SubTasks
CREATE TABLE IF NOT EXISTS subtasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    completed BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Work Logs
CREATE TABLE IF NOT EXISTS work_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date DATE NOT NULL,
    integrity_score INTEGER CHECK (integrity_score IN (0, 1)),
    missed_opportunity_note TEXT,
    success_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id TEXT,
    UNIQUE(user_id, log_date)
);

-- 5. Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5a. Recurring Expenses
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    note TEXT,
    recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('weekly', 'monthly')),
    recurrence_day INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    last_generated_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5b. Monthly Category Budgets
CREATE TABLE IF NOT EXISTS category_budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    amount REAL NOT NULL CHECK (amount >= 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id TEXT,
    UNIQUE(user_id, category, month)
);

-- 5c. Expense Tags (reusable snapshots for frequent expenses)
CREATE TABLE IF NOT EXISTS expense_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    amount REAL NOT NULL CHECK (amount >= 0),
    note TEXT,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0,
    last_used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5d. Expense Categories (user-editable; replaces hard-coded frontend list)
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id TEXT,
    UNIQUE(user_id, name)
);

-- 5e. Prepaid Cards (load up-front, spend like a credit card, often at a discount)
CREATE TABLE IF NOT EXISTS prepaid_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    default_discount_rate REAL NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5f. Card Loads (one tranche per top-up; balance is derived from these rows)
CREATE TABLE IF NOT EXISTS card_loads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES prepaid_cards(id),
    cash_paid REAL NOT NULL CHECK (cash_paid >= 0),
    face_value REAL NOT NULL CHECK (face_value > 0),
    discount_rate REAL NOT NULL,
    face_remaining REAL NOT NULL,
    note TEXT,
    loaded_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5g. Card Payment Allocations (which tranche(s) each card expense drew from; for FIFO + clean reversal)
CREATE TABLE IF NOT EXISTS card_payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    load_id INTEGER NOT NULL REFERENCES card_loads(id),
    face_consumed REAL NOT NULL,
    real_cost REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5h. Expense Repayments (money paid back against an expense, e.g. a friend's
-- share; the expense's amount stays true to the bank charge and totals net it out)
CREATE TABLE IF NOT EXISTS expense_repayments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    amount REAL NOT NULL CHECK (amount > 0),
    note TEXT,
    repaid_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Weekly Reflections
CREATE TABLE IF NOT EXISTS weekly_reflections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start DATE NOT NULL,
    reflection_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Voice Commands (audit log for voice entry; every transcript + parse outcome,
-- so misheard or misparsed commands can be diagnosed after the fact)
CREATE TABLE IF NOT EXISTS voice_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    parsed TEXT,
    status TEXT NOT NULL CHECK (status IN ('created', 'unclear', 'error')),
    entity_kind TEXT,
    entity_id TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active ON recurring_expenses(is_active);
CREATE INDEX IF NOT EXISTS idx_category_budgets_month ON category_budgets(month);
CREATE INDEX IF NOT EXISTS idx_expense_tags_archived ON expense_tags(is_archived);
CREATE INDEX IF NOT EXISTS idx_categories_archived ON categories(is_archived, sort_order);
CREATE INDEX IF NOT EXISTS idx_prepaid_cards_archived ON prepaid_cards(is_archived);
CREATE INDEX IF NOT EXISTS idx_card_loads_card ON card_loads(card_id, loaded_at);
CREATE INDEX IF NOT EXISTS idx_card_alloc_expense ON card_payment_allocations(expense_id);
CREATE INDEX IF NOT EXISTS idx_card_alloc_load ON card_payment_allocations(load_id);
CREATE INDEX IF NOT EXISTS idx_expense_repayments_expense ON expense_repayments(expense_id);
`;

// Initialize schema on startup
async function initializeDatabase() {
  console.log(`[Database] Initializing database at: ${DATABASE_URL}`);
  
  // Split schema into individual statements and execute each
  // Remove comments and split by semicolon
  const cleanSchema = SCHEMA
    .split('\n')
    .map(line => line.trim())
    .filter(line => !line.startsWith('--'))
    .join('\n');
  
  const statements = cleanSchema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  console.log(`[Database] Executing ${statements.length} schema statements...`);
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    try {
      await db.execute(statement);
    } catch (err) {
      console.error(`[Database] Error executing statement ${i + 1}:`, statement.slice(0, 50) + '...');
      console.error(`[Database] Error:`, (err as Error).message);
      throw err;
    }
  }
  
  console.log(`[Database] Schema initialized successfully`);
  
  // Migration: Add scheduled_complete_date column if it doesn't exist
  try {
    await db.execute('ALTER TABLE tasks ADD COLUMN scheduled_complete_date TEXT');
    console.log('[Database] Added scheduled_complete_date column to tasks');
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add tag_id column to expenses if it doesn't exist
  try {
    await db.execute('ALTER TABLE expenses ADD COLUMN tag_id INTEGER');
    console.log('[Database] Added tag_id column to expenses');
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add tag_id column to recurring_expenses if it doesn't exist
  try {
    await db.execute('ALTER TABLE recurring_expenses ADD COLUMN tag_id INTEGER');
    console.log('[Database] Added tag_id column to recurring_expenses');
  } catch {
    // Column already exists, ignore error
  }

  // Migration: Add category_id columns to all category-bearing tables
  try { await db.execute('ALTER TABLE expenses ADD COLUMN category_id INTEGER REFERENCES categories(id)'); console.log('[Database] Added category_id to expenses'); } catch {}
  try { await db.execute('ALTER TABLE recurring_expenses ADD COLUMN category_id INTEGER REFERENCES categories(id)'); console.log('[Database] Added category_id to recurring_expenses'); } catch {}
  try { await db.execute('ALTER TABLE category_budgets ADD COLUMN category_id INTEGER REFERENCES categories(id)'); console.log('[Database] Added category_id to category_budgets'); } catch {}
  try { await db.execute('ALTER TABLE expense_tags ADD COLUMN category_id INTEGER REFERENCES categories(id)'); console.log('[Database] Added category_id to expense_tags'); } catch {}

  // Migration: prepaid-card support on expenses.
  //   card_id    — which prepaid card paid for this expense (NULL = direct/cash)
  //   face_amount — the price tag for a card purchase; `amount` always stays the
  //                 real (discounted) money spent so every existing report is correct.
  try { await db.execute('ALTER TABLE expenses ADD COLUMN card_id INTEGER REFERENCES prepaid_cards(id)'); console.log('[Database] Added card_id to expenses'); } catch {}
  try { await db.execute('ALTER TABLE expenses ADD COLUMN face_amount REAL'); console.log('[Database] Added face_amount to expenses'); } catch {}
  try { await db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_card ON expenses(card_id)'); } catch {}

  await migrateToPerUserData();
}

// Top-level tables that carry data ownership. Child tables (subtasks, goal_logs,
// goal_relations, card_loads, card_payment_allocations, expense_repayments) are
// scoped through their parent's user_id and deliberately have no column of their own.
const USER_SCOPED_TABLES: ReadonlyArray<string> = [
  'goals',
  'tasks',
  'work_logs',
  'expenses',
  'recurring_expenses',
  'category_budgets',
  'expense_tags',
  'categories',
  'prepaid_cards',
  'weekly_reflections',
  'voice_commands',
];

async function migrateToPerUserData() {
  // Step 1: add user_id everywhere (idempotent; ALTER fails if it exists)
  for (const table of USER_SCOPED_TABLES) {
    try {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN user_id TEXT`);
      console.log(`[Database] Added user_id to ${table}`);
    } catch {}
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_${table}_user ON ${table}(user_id)`);
  }

  // Step 2: rebuild tables whose UNIQUE constraints must become per-user.
  // db.migrate() wraps the batch in PRAGMA foreign_keys=off/on so dropping a
  // table other tables reference (categories) is safe and atomic.
  await rebuildIfLegacyUnique('work_logs', [
    `CREATE TABLE work_logs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        log_date DATE NOT NULL,
        integrity_score INTEGER CHECK (integrity_score IN (0, 1)),
        missed_opportunity_note TEXT,
        success_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT,
        UNIQUE(user_id, log_date)
    )`,
    `INSERT INTO work_logs_new (id, log_date, integrity_score, missed_opportunity_note, success_note, created_at, user_id)
       SELECT id, log_date, integrity_score, missed_opportunity_note, success_note, created_at, user_id FROM work_logs`,
    'DROP TABLE work_logs',
    'ALTER TABLE work_logs_new RENAME TO work_logs',
    'CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(log_date)',
    'CREATE INDEX IF NOT EXISTS idx_work_logs_user ON work_logs(user_id)',
  ]);

  await rebuildIfLegacyUnique('categories', [
    `CREATE TABLE categories_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL COLLATE NOCASE,
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        is_system INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT,
        UNIQUE(user_id, name)
    )`,
    `INSERT INTO categories_new (id, name, icon, color, sort_order, is_archived, is_system, created_at, user_id)
       SELECT id, name, icon, color, sort_order, is_archived, is_system, created_at, user_id FROM categories`,
    'DROP TABLE categories',
    'ALTER TABLE categories_new RENAME TO categories',
    'CREATE INDEX IF NOT EXISTS idx_categories_archived ON categories(is_archived, sort_order)',
    'CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id)',
  ]);

  await rebuildIfLegacyUnique('category_budgets', [
    `CREATE TABLE category_budgets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
        amount REAL NOT NULL CHECK (amount >= 0),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        category_id INTEGER REFERENCES categories(id),
        user_id TEXT,
        UNIQUE(user_id, category, month)
    )`,
    `INSERT INTO category_budgets_new (id, category, month, amount, created_at, category_id, user_id)
       SELECT id, category, month, amount, created_at, category_id, user_id FROM category_budgets`,
    'DROP TABLE category_budgets',
    'ALTER TABLE category_budgets_new RENAME TO category_budgets',
    'CREATE INDEX IF NOT EXISTS idx_category_budgets_month ON category_budgets(month)',
    'CREATE INDEX IF NOT EXISTS idx_category_budgets_user ON category_budgets(user_id)',
  ]);

  // Step 3: one-off owner backfill. Set MIGRATE_OWNER_USER_ID to a Clerk user id
  // to claim every unowned row (the pre-auth data) for that user. Safe to leave
  // set: it only ever touches rows where user_id IS NULL.
  const owner = process.env.MIGRATE_OWNER_USER_ID;
  if (owner) {
    for (const table of USER_SCOPED_TABLES) {
      const result = await db.execute({
        sql: `UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`,
        args: [owner],
      });
      if (result.rowsAffected > 0) {
        console.log(`[Database] Backfilled ${result.rowsAffected} ${table} rows to owner`);
      }
    }
  }
}

/**
 * Rebuilds a table (SQLite can't alter UNIQUE constraints in place) unless its
 * current definition already contains the per-user constraint. Detection reads
 * the live DDL from sqlite_master, so re-running is a no-op.
 */
async function rebuildIfLegacyUnique(table: string, statements: string[]) {
  const ddl = await db.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [table],
  });
  const sql = String((ddl.rows[0] as unknown as { sql: string } | undefined)?.sql ?? '');
  if (sql.includes('UNIQUE(user_id')) return;
  await db.migrate(statements);
  console.log(`[Database] Rebuilt ${table} with per-user uniqueness`);
}

const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; icon: string; color: string; isSystem: 0 | 1 }> = [
  { name: 'Food',          icon: '🍴', color: '#f97316', isSystem: 0 },
  { name: 'Groceries',     icon: '🛒', color: '#3b82f6', isSystem: 0 },
  { name: 'Transport',     icon: '🚌', color: '#f59e0b', isSystem: 0 },
  { name: 'Shopping',      icon: '🛍️', color: '#ec4899', isSystem: 0 },
  { name: 'Bills',         icon: '📄', color: '#64748b', isSystem: 0 },
  { name: 'Entertainment', icon: '🎮', color: '#a855f7', isSystem: 0 },
  { name: 'Health',        icon: '💊', color: '#10b981', isSystem: 0 },
  { name: 'Other',         icon: '📦', color: '#6b7280', isSystem: 1 },
];

const FALLBACK_PALETTE = [
  '#f97316', '#f59e0b', '#eab308', '#84cc16', '#10b981', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ef4444',
  '#64748b', '#6b7280', '#78716c', '#0ea5e9',
];

/**
 * Seeds the default category set for a user who has none yet. Called lazily
 * from the categories routes (first read after sign-up), so new users get a
 * working expense screen without a users table or Clerk webhook.
 */
export async function ensureUserCategories(userId: string): Promise<void> {
  const existing = await db.execute({
    sql: 'SELECT COUNT(*) AS c FROM categories WHERE user_id = ?',
    args: [userId],
  });
  if (Number((existing.rows[0] as unknown as { c: number }).c) > 0) return;

  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const c = DEFAULT_CATEGORIES[i];
    await db.execute({
      sql: 'INSERT OR IGNORE INTO categories (name, icon, color, sort_order, is_system, user_id) VALUES (?, ?, ?, ?, ?, ?)',
      args: [c.name, c.icon, c.color, i, c.isSystem, userId],
    });
  }
  console.log(`[Database] Seeded default categories for ${userId}`);
}

/**
 * Resolve a category name to its id for one user (case-insensitive).
 * If no category matches, creates a new one owned by that user with a
 * fallback icon/color and returns its id. Used by INSERT/UPDATE handlers to
 * keep `category_id` populated on every write so filters/joins are accurate.
 */
export async function resolveCategoryId(userId: string, name: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const lookup = await db.execute({
    sql: 'SELECT id FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
    args: [userId, trimmed],
  });
  const existing = lookup.rows[0] as unknown as { id: number } | undefined;
  if (existing) return existing.id;

  const maxResult = await db.execute({
    sql: 'SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories WHERE user_id = ?',
    args: [userId],
  });
  const nextOrder = Number((maxResult.rows[0] as unknown as { m: number }).m) + 1;
  const color = FALLBACK_PALETTE[(nextOrder - 1) % FALLBACK_PALETTE.length];
  const insert = await db.execute({
    sql: 'INSERT INTO categories (name, icon, color, sort_order, is_system, user_id) VALUES (?, ?, ?, ?, 0, ?)',
    args: [trimmed, '📦', color, nextOrder, userId],
  });
  return Number(insert.lastInsertRowid);
}

// Initialize database (called from server startup)
export const initDb = initializeDatabase;

// Export client for queries
export default db;

// Create tracked execute wrapper for logging
export const trackedExecute = createTrackedExecute(db);

// Re-export logging utilities
export { queryLoggerMiddleware, setCurrentEndpoint, clearCurrentEndpoint };

// Helper to get current date in YYYY-MM-DD format
export const getToday = (): string => {
  return new Date().toISOString().split('T')[0];
};

// Helper to get start of current week (Sunday)
export const getWeekStart = (date?: Date): string => {
  const d = date || new Date();
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const diff = d.getDate() - day; // Go back to Sunday
  const sunday = new Date(d.setDate(diff));
  return sunday.toISOString().split('T')[0];
};

// Helper to get end of week (Saturday)
export const getWeekEnd = (weekStart: string): string => {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
};

/**
 * Returns the period start date for a frequency goal.
 * Used for counting logs within the current week/month/day.
 */
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
