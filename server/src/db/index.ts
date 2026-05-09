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
    log_date DATE UNIQUE NOT NULL,
    integrity_score INTEGER CHECK (integrity_score IN (0, 1)),
    missed_opportunity_note TEXT,
    success_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    UNIQUE(category, month)
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
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Weekly Reflections
CREATE TABLE IF NOT EXISTS weekly_reflections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start DATE NOT NULL,
    reflection_text TEXT,
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

  await seedAndBackfillCategories();
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

const TABLES_WITH_CATEGORY: ReadonlyArray<string> = [
  'expenses',
  'recurring_expenses',
  'category_budgets',
  'expense_tags',
];

async function seedAndBackfillCategories() {
  // Step 1: seed defaults if not present (idempotent via UNIQUE on name)
  for (let i = 0; i < DEFAULT_CATEGORIES.length; i++) {
    const c = DEFAULT_CATEGORIES[i];
    await db.execute({
      sql: 'INSERT OR IGNORE INTO categories (name, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, ?)',
      args: [c.name, c.icon, c.color, i, c.isSystem],
    });
  }

  // Step 2 + 3: back-fill category_id; auto-create unknown categories.
  // Each table is wrapped in try/catch because the legacy `category` text
  // column may already have been dropped on this DB. After the first
  // successful run, every row has `category_id` and the column drop in the
  // ALTER block below leaves nothing for the back-fill to do.
  for (const table of TABLES_WITH_CATEGORY) {
    try {
      // First pass: fill from existing categories (case-insensitive name match)
      await db.execute(`
        UPDATE ${table}
           SET category_id = (
             SELECT id FROM categories
              WHERE LOWER(name) = LOWER(${table}.category)
              LIMIT 1
           )
         WHERE category_id IS NULL
      `);

      // Find any remaining unknown category strings and create rows for them.
      const unknown = await db.execute({
        sql: `SELECT DISTINCT category FROM ${table} WHERE category_id IS NULL`,
        args: [],
      });
      const unknownNames = unknown.rows
        .map((r) => (r as unknown as { category: string }).category)
        .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);

      if (unknownNames.length > 0) {
        const maxResult = await db.execute('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories');
        let nextOrder = Number((maxResult.rows[0] as unknown as { m: number }).m) + 1;
        for (const name of unknownNames) {
          const color = FALLBACK_PALETTE[(nextOrder - 1) % FALLBACK_PALETTE.length];
          await db.execute({
            sql: 'INSERT OR IGNORE INTO categories (name, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, 0)',
            args: [name, '📦', color, nextOrder],
          });
          nextOrder += 1;
        }

        // Second pass to back-fill the rows we just created categories for.
        await db.execute(`
          UPDATE ${table}
             SET category_id = (
               SELECT id FROM categories
                WHERE LOWER(name) = LOWER(${table}.category)
                LIMIT 1
             )
           WHERE category_id IS NULL
        `);
      }
    } catch {
      // Column already dropped — back-fill no longer needed for this table.
    }
  }

  console.log('[Database] Categories seeded and back-filled');

  // Phase 4: drop the legacy `category` text columns now that:
  //   - every row has a non-null category_id (back-fill above),
  //   - every reader JOINs through categories, and
  //   - every writer sets category_id only.
  // category_budgets keeps its `category` column because it is part of a
  // UNIQUE(category, month) constraint that would require a table rebuild
  // to remove. That's a separate cleanup.
  try { await db.execute('ALTER TABLE expenses DROP COLUMN category'); console.log('[Database] Dropped legacy expenses.category column'); } catch {}
  try { await db.execute('ALTER TABLE recurring_expenses DROP COLUMN category'); console.log('[Database] Dropped legacy recurring_expenses.category column'); } catch {}
  try { await db.execute('ALTER TABLE expense_tags DROP COLUMN category'); console.log('[Database] Dropped legacy expense_tags.category column'); } catch {}
}

/**
 * Resolve a category name to its id (case-insensitive).
 * If no category matches, creates a new one with a fallback icon/color and
 * returns its id. Used by INSERT/UPDATE handlers to keep `category_id`
 * populated on every write so filters/joins are always accurate.
 */
export async function resolveCategoryId(name: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const lookup = await db.execute({
    sql: 'SELECT id FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1',
    args: [trimmed],
  });
  const existing = lookup.rows[0] as unknown as { id: number } | undefined;
  if (existing) return existing.id;

  const maxResult = await db.execute('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories');
  const nextOrder = Number((maxResult.rows[0] as unknown as { m: number }).m) + 1;
  const color = FALLBACK_PALETTE[(nextOrder - 1) % FALLBACK_PALETTE.length];
  const insert = await db.execute({
    sql: 'INSERT INTO categories (name, icon, color, sort_order, is_system) VALUES (?, ?, ?, ?, 0)',
    args: [trimmed, '📦', color, nextOrder],
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
