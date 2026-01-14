-- The Auditor Database Schema

-- 1. Goals Table (Exercise, Reading, etc.)
CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES goals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    goal_type TEXT DEFAULT 'frequency' CHECK (goal_type IN ('reading', 'frequency', 'numeric')),
    target_value INTEGER NOT NULL DEFAULT 0,
    unit TEXT,
    current_value INTEGER DEFAULT 0,
    -- Reading-specific fields
    total_pages INTEGER,
    current_page INTEGER DEFAULT 0,
    -- Frequency-specific (e.g., "4 times per week")
    frequency_period TEXT CHECK (frequency_period IN ('daily', 'weekly', 'monthly')),
    -- Metadata
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

-- 1b. Progress Logs for Goals (tracks daily entries)
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

-- 2. Tasks with Parent-Child Relationship
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'Personal' CHECK (category IN ('Work', 'Admin', 'Personal')),
    deadline DATETIME,
    scheduled_complete_date TEXT,  -- YYYY-MM-DD format for weekly scheduling
    is_completed BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. SubTasks (stored as separate table for flexibility)
CREATE TABLE IF NOT EXISTS subtasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    completed BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Daily Integrity & Work Logs (The "LMO")
CREATE TABLE IF NOT EXISTS work_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date DATE UNIQUE NOT NULL,
    integrity_score INTEGER CHECK (integrity_score IN (0, 1)),
    missed_opportunity_note TEXT,
    success_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Financial Tracking
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5a. Recurring Expenses (templates for auto-generated expenses)
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    note TEXT,
    recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('weekly', 'monthly')),
    recurrence_day INTEGER NOT NULL,  -- 0-6 for weekly (Mon-Sun), 1-31 for monthly
    is_active BOOLEAN DEFAULT 1,
    last_generated_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Weekly Reflections (optional storage for summaries)
CREATE TABLE IF NOT EXISTS weekly_reflections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start DATE NOT NULL,
    reflection_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active ON recurring_expenses(is_active);

