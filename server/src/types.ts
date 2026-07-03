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
  category_id: number | null;
  note: string | null;
  created_at: string;
  tag_id: number | null;
  card_id: number | null;
  face_amount: number | null;
  repaid_total: number;
}

export interface ExpenseRepaymentRow {
  id: number;
  expense_id: number;
  amount: number;
  note: string | null;
  repaid_at: string;
  created_at: string;
}

export interface RecurringExpenseRow {
  id: number;
  amount: number;
  category: string;
  category_id: number | null;
  note: string | null;
  recurrence_type: 'weekly' | 'monthly';
  recurrence_day: number;
  is_active: number;
  last_generated_date: string | null;
  created_at: string;
  tag_id: number | null;
}

export interface CategoryBudgetRow {
  id: number;
  category: string;
  category_id: number | null;
  month: string;
  amount: number;
  created_at: string;
}

export interface TagRow {
  id: number;
  name: string;
  category: string;
  category_id: number | null;
  amount: number;
  note: string | null;
  icon: string;
  color: string;
  is_archived: number;
  last_used_at: string | null;
  created_at: string;
}

export interface CategoryRow {
  id: number;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  is_archived: number;
  is_system: number;
  created_at: string;
}

export interface PrepaidCardRow {
  id: number;
  name: string;
  icon: string;
  color: string;
  default_discount_rate: number;
  is_archived: number;
  created_at: string;
}

export interface CardLoadRow {
  id: number;
  card_id: number;
  cash_paid: number;
  face_value: number;
  discount_rate: number;
  face_remaining: number;
  note: string | null;
  loaded_at: string;
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
  amount: number;          // real money spent (= face × discount factor for card purchases)
  category: string;
  categoryId: number | null;
  note: string | null;
  createdAt: string;
  tagId: number | null;
  cardId: number | null;   // prepaid card this was paid from, or null for direct/cash
  faceAmount: number | null; // price tag for card purchases; null for direct expenses
  repaidTotal: number;     // Σ expense_repayments.amount; net cost = amount − repaidTotal
}

export interface ExpenseRepayment {
  id: number;
  expenseId: number;
  amount: number;
  note: string | null;
  repaidAt: string;
  createdAt: string;
}

export interface RecurringExpense {
  id: number;
  amount: number;
  category: string;
  categoryId: number | null;
  note: string | null;
  recurrenceType: 'weekly' | 'monthly';
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
  month: string;
  amount: number;
  createdAt: string;
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

export interface PrepaidCard {
  id: number;
  name: string;
  icon: string;
  color: string;
  defaultDiscountRate: number;
  isArchived: boolean;
  createdAt: string;
  // Derived from the load ledger (see services/cardLedger.ts)
  balance: number;
  realValueRemaining: number;
  lifetimeSavings: number;
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
    categoryId: row.category_id,
    note: row.note,
    createdAt: row.created_at,
    tagId: row.tag_id,
    cardId: row.card_id ?? null,
    faceAmount: row.face_amount ?? null,
    repaidTotal: Number(row.repaid_total ?? 0),
  };
}

export function repaymentRowToRepayment(row: ExpenseRepaymentRow): ExpenseRepayment {
  return {
    id: row.id,
    expenseId: row.expense_id,
    amount: row.amount,
    note: row.note,
    repaidAt: row.repaid_at,
    createdAt: row.created_at,
  };
}

export function recurringExpenseRowToRecurringExpense(row: RecurringExpenseRow): RecurringExpense {
  return {
    id: row.id,
    amount: row.amount,
    category: row.category,
    categoryId: row.category_id,
    note: row.note,
    recurrenceType: row.recurrence_type,
    recurrenceDay: row.recurrence_day,
    isActive: Boolean(row.is_active),
    lastGeneratedDate: row.last_generated_date,
    createdAt: row.created_at,
    tagId: row.tag_id,
  };
}

export function budgetRowToBudget(row: CategoryBudgetRow): Budget {
  return {
    id: row.id,
    category: row.category,
    categoryId: row.category_id,
    month: row.month,
    amount: row.amount,
    createdAt: row.created_at,
  };
}

export function tagRowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    categoryId: row.category_id,
    amount: row.amount,
    note: row.note,
    icon: row.icon,
    color: row.color,
    isArchived: Boolean(row.is_archived),
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

export function categoryRowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    isArchived: Boolean(row.is_archived),
    isSystem: Boolean(row.is_system),
    createdAt: row.created_at,
  };
}

export function cardLoadRowToCardLoad(row: CardLoadRow): CardLoad {
  return {
    id: row.id,
    cardId: row.card_id,
    cashPaid: row.cash_paid,
    faceValue: row.face_value,
    discountRate: row.discount_rate,
    faceRemaining: row.face_remaining,
    note: row.note,
    loadedAt: row.loaded_at,
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

