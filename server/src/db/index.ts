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
    category TEXT NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5a. Recurring Expenses
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    note TEXT,
    recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('weekly', 'monthly')),
    recurrence_day INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    last_generated_date DATE,
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
