// Database row types (snake_case to match SQL)
export interface TaskRow {
  id: string;
  parent_id: string | null;
  title: string;
  category: 'Work' | 'Admin' | 'Personal';
  deadline: string | null;
  scheduled_complete_date: string | null;
  is_completed: number;
  created_at: string;
}

export interface SubTaskRow {
  id: string;
  task_id: string;
  text: string;
  completed: number;
  created_at: string;
}

export interface WorkLogRow {
  id: number;
  log_date: string;
  integrity_score: number | null;
  missed_opportunity_note: string | null;
  success_note: string | null;
  created_at: string;
}

export interface ExpenseRow {
  id: number;
  amount: number;
  category: string;
  note: string | null;
  created_at: string;
}

export interface GoalRow {
  id: string;
  parent_id: string | null;
  title: string;
  goal_type: 'reading' | 'frequency' | 'numeric';
  target_value: number;
  unit: string;
  current_value: number;
  total_pages: number | null;
  current_page: number;
  frequency_period: 'daily' | 'weekly' | 'monthly' | null;
  start_date: string;
  target_date: string | null;
  is_active: number;
  created_at: string;
}

export interface GoalLogRow {
  id: number;
  goal_id: string;
  log_date: string;
  value: number;
  note: string | null;
  created_at: string;
}

// API response types (camelCase)
export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface Task {
  id: string;
  parentId: string | null;
  title: string;
  subTasks: SubTask[];
  category: 'Work' | 'Admin' | 'Personal';
  deadline: string | null;
  scheduledCompleteDate: string | null;
  isCompleted: boolean;
  createdAt: string;
}

export interface WorkLog {
  id: number;
  logDate: string;
  integrityScore: 0 | 1 | null;
  missedOpportunityNote: string | null;
  successNote: string | null;
  createdAt: string;
}

export interface Expense {
  id: number;
  amount: number;
  category: string;
  note: string | null;
  createdAt: string;
}

export interface Goal {
  id: string;
  parentId: string | null;
  title: string;
  goalType: 'reading' | 'frequency' | 'numeric';
  targetValue: number;
  unit: string;
  currentValue: number;
  totalPages: number | null;
  currentPage: number;
  frequencyPeriod: 'daily' | 'weekly' | 'monthly' | null;
  startDate: string;
  targetDate: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface GoalLog {
  id: number;
  goalId: string;
  logDate: string;
  value: number;
  note: string | null;
  createdAt: string;
}

export interface GoalStats {
  goal: Goal;
  logs: GoalLog[];
  subGoals: Goal[];
  subGoalsCompleted: number;
  velocity: number | null;
  estimatedFinishDate: string | null;
  daysRemaining: number | null;
  progressPercent: number;
  streak: number;
  periodProgress: { current: number; target: number } | null;
}

export interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  workLogs: WorkLog[];
  expenses: Expense[];
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  integrityRate: number;
  goals: Goal[];
  missedOpportunityNotes: string[];
}

// Row to API type converters
export function taskRowToTask(row: TaskRow, subTasks: SubTask[]): Task {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    subTasks,
    category: row.category,
    deadline: row.deadline,
    scheduledCompleteDate: row.scheduled_complete_date,
    isCompleted: Boolean(row.is_completed),
    createdAt: row.created_at,
  };
}

export function subTaskRowToSubTask(row: SubTaskRow): SubTask {
  return {
    id: row.id,
    text: row.text,
    completed: Boolean(row.completed),
  };
}

export function workLogRowToWorkLog(row: WorkLogRow): WorkLog {
  return {
    id: row.id,
    logDate: row.log_date,
    integrityScore: row.integrity_score as 0 | 1 | null,
    missedOpportunityNote: row.missed_opportunity_note,
    successNote: row.success_note,
    createdAt: row.created_at,
  };
}

export function expenseRowToExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    amount: row.amount,
    category: row.category,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function goalRowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    goalType: row.goal_type,
    targetValue: row.target_value,
    unit: row.unit,
    currentValue: row.current_value,
    totalPages: row.total_pages,
    currentPage: row.current_page,
    frequencyPeriod: row.frequency_period,
    startDate: row.start_date,
    targetDate: row.target_date,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

export function goalLogRowToGoalLog(row: GoalLogRow): GoalLog {
  return {
    id: row.id,
    goalId: row.goal_id,
    logDate: row.log_date,
    value: row.value,
    note: row.note,
    createdAt: row.created_at,
  };
}

