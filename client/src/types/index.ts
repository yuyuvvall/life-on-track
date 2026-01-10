// Core domain types matching SQL schema

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

export type GoalType = 'reading' | 'frequency' | 'numeric';
export type FrequencyPeriod = 'daily' | 'weekly' | 'monthly';

export interface Goal {
  id: string;
  parentId: string | null;
  title: string;
  goalType: GoalType;
  targetValue: number;
  unit: string;
  currentValue: number;
  totalPages: number | null;
  currentPage: number;
  frequencyPeriod: FrequencyPeriod | null;
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

// API request types
export interface CreateTaskRequest {
  title: string;
  category: 'Work' | 'Admin' | 'Personal';
  deadline?: string;
  parentId?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  category?: 'Work' | 'Admin' | 'Personal';
  deadline?: string;
  scheduledCompleteDate?: string | null;
  isCompleted?: boolean;
}

export interface CreateSubTaskRequest {
  taskId: string;
  text: string;
}

export interface UpdateSubTaskRequest {
  completed?: boolean;
  text?: string;
}

export interface CreateWorkLogRequest {
  logDate: string;
  integrityScore: 0 | 1;
  missedOpportunityNote?: string;
  successNote?: string;
}

export interface CreateExpenseRequest {
  amount: number;
  category: string;
  note?: string;
  createdAt?: string;
}

export interface CreateGoalRequest {
  title: string;
  goalType: GoalType;
  targetValue: number;
  unit?: string;
  totalPages?: number;
  frequencyPeriod?: FrequencyPeriod;
  targetDate?: string;
  parentId?: string;
}

export interface UpdateGoalRequest {
  title?: string;
  targetValue?: number;
  unit?: string;
  currentValue?: number;
  currentPage?: number;
  totalPages?: number;
  targetDate?: string;
  isActive?: boolean;
}

export interface CreateGoalLogRequest {
  value: number;
  note?: string;
  logDate?: string;
}

// UI State types
export type TaskCategory = 'Work' | 'Admin' | 'Personal';

export const EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Entertainment',
  'Shopping',
  'Bills',
  'Health',
  'Other'
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

