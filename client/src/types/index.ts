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
  amount: number;            // real money spent (discounted for card purchases)
  category: string;
  categoryId: number | null;
  note: string | null;
  createdAt: string;
  tagId: number | null;
  cardId: number | null;     // prepaid card this was paid from, or null for direct/cash
  faceAmount: number | null; // price tag for card purchases; null for direct expenses
}

export type RecurrenceType = 'weekly' | 'monthly';

export interface RecurringExpense {
  id: number;
  amount: number;
  category: string;
  categoryId: number | null;
  note: string | null;
  recurrenceType: RecurrenceType;
  recurrenceDay: number;
  isActive: boolean;
  lastGeneratedDate: string | null;
  createdAt: string;
  tagId: number | null;
}

export interface Budget {
  id: number;
  category: string;
  categoryId: number | null;
  month: string;   // 'YYYY-MM'
  amount: number;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  isArchived: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface CategoryDependents {
  activeRecurring: number;
  activeBudgets: number;
  expensesLast30Days: number;
}

export interface CategoryWithDependents extends Category {
  dependents: CategoryDependents;
}

export interface CreateCategoryRequest {
  name: string;
  icon: string;
  color: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  icon?: string;
  color?: string;
  sortOrder?: number;
  isArchived?: boolean;
}

export interface UpsertBudgetRequest {
  category: string;
  month: string;
  amount: number;
}

export interface Tag {
  id: number;
  name: string;
  category: string;
  categoryId: number | null;
  amount: number;
  note: string | null;
  icon: string;
  color: string;
  isArchived: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateTagRequest {
  name: string;
  category: string;
  amount: number;
  note?: string;
  icon: string;
  color: string;
}

export interface UpdateTagRequest {
  name?: string;
  category?: string;
  amount?: number;
  note?: string;
  icon?: string;
  color?: string;
  isArchived?: boolean;
}

// Prepaid cards: loaded up-front (often at a discount), then spent like a credit card.
export interface PrepaidCard {
  id: number;
  name: string;
  icon: string;
  color: string;
  defaultDiscountRate: number;     // 0.30 = 30% off
  isArchived: boolean;
  createdAt: string;
  balance: number;                 // face value still spendable
  realValueRemaining: number;      // prepaid cash still on the card
  lifetimeSavings: number;         // total face loaded − total cash paid
}

export interface PrepaidCardDependents {
  loads: number;
  payments: number;
}

export interface PrepaidCardWithDependents extends PrepaidCard {
  dependents: PrepaidCardDependents;
}

export interface CardLoad {
  id: number;
  cardId: number;
  cashPaid: number;
  faceValue: number;
  discountRate: number;
  faceRemaining: number;
  note: string | null;
  loadedAt: string;
  createdAt: string;
}

export interface CreateCardRequest {
  name: string;
  icon: string;
  color: string;
  defaultDiscountRate?: number;
}

export interface UpdateCardRequest {
  name?: string;
  icon?: string;
  color?: string;
  defaultDiscountRate?: number;
  isArchived?: boolean;
}

export interface CreateCardLoadRequest {
  cashPaid: number;
  discountRate?: number;   // defaults to the card default
  faceValue?: number;      // optional explicit balance received; overrides the rate
  loadedAt?: string;
  note?: string;
}

export interface CreateCardLoadResponse {
  load: CardLoad;
  card: PrepaidCard | null;
}

export type CardActivityItem =
  | {
      type: 'load';
      id: number;
      at: string;
      cashPaid: number;
      faceValue: number;
      discountRate: number;
      note: string | null;
    }
  | {
      type: 'payment';
      id: number;
      at: string;
      amount: number;
      faceAmount: number | null;
      category: string | null;
      note: string | null;
    };

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
  amount: number;        // price tag (face value) when cardId is set; real amount otherwise
  category: string;
  note?: string;
  createdAt?: string;
  tagId?: number | null;
  cardId?: number | null;
}

export interface UpdateExpenseRequest {
  amount?: number;       // price tag (face value) when the expense is paid from a card
  category?: string;
  note?: string;
  createdAt?: string;
  tagId?: number | null;
  cardId?: number | null;
}

export interface CreateRecurringExpenseRequest {
  amount: number;
  category: string;
  note?: string;
  recurrenceType: RecurrenceType;
  recurrenceDay: number;
  tagId?: number | null;
}

export interface UpdateRecurringExpenseRequest {
  amount?: number;
  category?: string;
  note?: string;
  recurrenceType?: RecurrenceType;
  recurrenceDay?: number;
  isActive?: boolean;
  tagId?: number | null;
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

export interface UpdateGoalLogRequest {
  value?: number;
  note?: string;
  logDate?: string;
}

// UI State types
export type TaskCategory = 'Work' | 'Admin' | 'Personal';

