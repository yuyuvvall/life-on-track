import type {
  Task,
  WorkLog,
  Expense,
  RecurringExpense,
  Budget,
  UpsertBudgetRequest,
  Tag,
  Category,
  CategoryWithDependents,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CreateTagRequest,
  UpdateTagRequest,
  PrepaidCard,
  PrepaidCardWithDependents,
  CardLoad,
  CardActivityItem,
  CreateCardRequest,
  UpdateCardRequest,
  CreateCardLoadRequest,
  CreateCardLoadResponse,
  Goal,
  GoalLog,
  GoalStats,
  WeeklySummary,
  CreateTaskRequest,
  UpdateTaskRequest,
  CreateSubTaskRequest,
  UpdateSubTaskRequest,
  CreateWorkLogRequest,
  CreateExpenseRequest,
  UpdateExpenseRequest,
  ExpenseRepayment,
  CreateRepaymentRequest,
  CreateRepaymentResponse,
  CreateRecurringExpenseRequest,
  UpdateRecurringExpenseRequest,
  CreateGoalRequest,
  UpdateGoalRequest,
  CreateGoalLogRequest,
  UpdateGoalLogRequest,
} from '@/types';

// Use environment variable for production, proxy for development
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Clerk session token getter, registered from inside the React tree
// (this module is not a React context, so the hook result is bridged in).
type AuthTokenGetter = () => Promise<string | null>;
let authTokenGetter: AuthTokenGetter | null = null;

export function setAuthTokenGetter(getter: AuthTokenGetter | null) {
  authTokenGetter = getter;
}

// Request options with optional purpose for logging
interface RequestOptions extends RequestInit {
  purpose?: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { purpose, ...fetchOptions } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...fetchOptions.headers,
  };

  // Add X-Purpose header if provided
  if (purpose) {
    (headers as Record<string, string>)['X-Purpose'] = purpose;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Fetch a fresh token per attempt — Clerk refreshes short-lived tokens
      if (authTokenGetter) {
        const token = await authTokenGetter().catch(() => null);
        if (token) {
          (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
        }
      }

      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        headers,
      });

      if (response.status === 503) {
        // Server waking up (cold start) — retry after delay
        lastError = new Error('Service temporarily unavailable');
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(error.message || `HTTP ${response.status}`);
      }

      // Handle 204 No Content responses
      if (response.status === 204) {
        return undefined as T;
      }

      return response.json();
    } catch (err) {
      // Network errors (CORS failures from cold start manifest as TypeError)
      if (err instanceof TypeError || (err instanceof Error && err.message === 'Service temporarily unavailable')) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
      }
      throw err;
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}

// Tasks API
export const tasksApi = {
  getAll: (purpose?: string) => 
    request<Task[]>('/tasks', { purpose }),
  
  getById: (id: string, purpose?: string) => 
    request<Task>(`/tasks/${id}`, { purpose }),
  
  create: (data: CreateTaskRequest, purpose?: string) =>
    request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),
  
  update: (id: string, data: UpdateTaskRequest, purpose?: string) =>
    request<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      purpose,
    }),
  
  delete: (id: string, purpose?: string) =>
    request<void>(`/tasks/${id}`, { method: 'DELETE', purpose }),
  
  // SubTasks
  addSubTask: (data: CreateSubTaskRequest, purpose?: string) =>
    request<Task>(`/tasks/${data.taskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ text: data.text }),
      purpose,
    }),
  
  updateSubTask: (taskId: string, subTaskId: string, data: UpdateSubTaskRequest, purpose?: string) =>
    request<Task>(`/tasks/${taskId}/subtasks/${subTaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      purpose,
    }),
  
  deleteSubTask: (taskId: string, subTaskId: string, purpose?: string) =>
    request<Task>(`/tasks/${taskId}/subtasks/${subTaskId}`, {
      method: 'DELETE',
      purpose,
    }),
};

// Work Logs API
export const workLogsApi = {
  getAll: (purpose?: string) => 
    request<WorkLog[]>('/work-logs', { purpose }),
  
  getByDate: (date: string, purpose?: string) => 
    request<WorkLog | null>(`/work-logs/date/${date}`, { purpose }),
  
  getToday: (purpose?: string) => 
    request<WorkLog | null>('/work-logs/today', { purpose }),
  
  create: (data: CreateWorkLogRequest, purpose?: string) =>
    request<WorkLog>('/work-logs', {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),
  
  update: (id: number, data: Partial<CreateWorkLogRequest>, purpose?: string) =>
    request<WorkLog>(`/work-logs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      purpose,
    }),
};

// Expenses API
export const expensesApi = {
  getAll: (purpose?: string) => 
    request<Expense[]>('/expenses', { purpose }),
  
  getById: (id: number, purpose?: string) =>
    request<Expense>(`/expenses/${id}`, { purpose }),
  
  getByDateRange: (start: string, end: string, purpose?: string) =>
    request<Expense[]>(`/expenses?start=${start}&end=${end}`, { purpose }),
  
  create: (data: CreateExpenseRequest, purpose?: string) =>
    request<Expense>('/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),
  
  update: (id: number, data: UpdateExpenseRequest, purpose?: string) =>
    request<Expense>(`/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      purpose,
    }),
  
  delete: (id: number, purpose?: string) =>
    request<void>(`/expenses/${id}`, { method: 'DELETE', purpose }),

  getRepayments: (id: number, purpose?: string) =>
    request<ExpenseRepayment[]>(`/expenses/${id}/repayments`, { purpose }),

  addRepayment: (id: number, data: CreateRepaymentRequest, purpose?: string) =>
    request<CreateRepaymentResponse>(`/expenses/${id}/repayments`, {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),

  deleteRepayment: (id: number, repaymentId: number, purpose?: string) =>
    request<void>(`/expenses/${id}/repayments/${repaymentId}`, { method: 'DELETE', purpose }),
};

// Recurring Expenses API
export const recurringExpensesApi = {
  getAll: (purpose?: string) => 
    request<RecurringExpense[]>('/recurring-expenses', { purpose }),
  
  create: (data: CreateRecurringExpenseRequest, purpose?: string) =>
    request<RecurringExpense>('/recurring-expenses', {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),
  
  update: (id: number, data: UpdateRecurringExpenseRequest, purpose?: string) =>
    request<RecurringExpense>(`/recurring-expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      purpose,
    }),
  
  delete: (id: number, purpose?: string) =>
    request<void>(`/recurring-expenses/${id}`, { method: 'DELETE', purpose }),
  
  generate: (purpose?: string) =>
    request<{ generated: Expense[]; count: number }>('/recurring-expenses/generate', {
      method: 'POST',
      purpose,
    }),
};

// Budgets API
export const budgetsApi = {
  getByMonth: (month: string, purpose?: string) =>
    request<Budget[]>(`/budgets?month=${month}`, { purpose }),

  upsert: (data: UpsertBudgetRequest, purpose?: string) =>
    request<Budget>('/budgets', {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),

  changeFromNow: (data: UpsertBudgetRequest, purpose?: string) =>
    request<Budget>('/budgets/change-from-now', {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),

  removeEntirely: (category: string, month: string, purpose?: string) =>
    request<void>('/budgets/remove-entirely', {
      method: 'POST',
      body: JSON.stringify({ category, month }),
      purpose,
    }),

  delete: (id: number, purpose?: string) =>
    request<void>(`/budgets/${id}`, { method: 'DELETE', purpose }),
};

// Categories API
export const categoriesApi = {
  getAll: (includeArchived?: boolean, purpose?: string) =>
    request<Category[]>(
      includeArchived ? '/categories?includeArchived=1' : '/categories',
      { purpose },
    ),

  getById: (id: number, purpose?: string) =>
    request<CategoryWithDependents>(`/categories/${id}`, { purpose }),

  create: (data: CreateCategoryRequest, purpose?: string) =>
    request<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),

  update: (id: number, data: UpdateCategoryRequest, purpose?: string) =>
    request<Category>(`/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      purpose,
    }),

  delete: (id: number, purpose?: string) =>
    request<void>(`/categories/${id}`, { method: 'DELETE', purpose }),
};

// Tags API
export const tagsApi = {
  getAll: (includeArchived?: boolean, purpose?: string) =>
    request<Tag[]>(
      includeArchived ? '/tags?includeArchived=1' : '/tags',
      { purpose },
    ),

  getById: (id: number, purpose?: string) =>
    request<Tag>(`/tags/${id}`, { purpose }),

  create: (data: CreateTagRequest, purpose?: string) =>
    request<Tag>('/tags', {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),

  update: (id: number, data: UpdateTagRequest, purpose?: string) =>
    request<Tag>(`/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      purpose,
    }),

  delete: (id: number, purpose?: string) =>
    request<void>(`/tags/${id}`, { method: 'DELETE', purpose }),
};

// Prepaid Cards API
export const cardsApi = {
  getAll: (includeArchived?: boolean, purpose?: string) =>
    request<PrepaidCard[]>(
      includeArchived ? '/cards?includeArchived=1' : '/cards',
      { purpose },
    ),

  getById: (id: number, purpose?: string) =>
    request<PrepaidCardWithDependents>(`/cards/${id}`, { purpose }),

  create: (data: CreateCardRequest, purpose?: string) =>
    request<PrepaidCard>('/cards', {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),

  update: (id: number, data: UpdateCardRequest, purpose?: string) =>
    request<PrepaidCard>(`/cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      purpose,
    }),

  delete: (id: number, purpose?: string) =>
    request<void>(`/cards/${id}`, { method: 'DELETE', purpose }),

  // Loads
  getLoads: (cardId: number, purpose?: string) =>
    request<CardLoad[]>(`/cards/${cardId}/loads`, { purpose }),

  createLoad: (cardId: number, data: CreateCardLoadRequest, purpose?: string) =>
    request<CreateCardLoadResponse>(`/cards/${cardId}/loads`, {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),

  updateLoad: (cardId: number, loadId: number, data: Partial<CreateCardLoadRequest>, purpose?: string) =>
    request<CardLoad>(`/cards/${cardId}/loads/${loadId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      purpose,
    }),

  deleteLoad: (cardId: number, loadId: number, purpose?: string) =>
    request<void>(`/cards/${cardId}/loads/${loadId}`, { method: 'DELETE', purpose }),

  getActivity: (cardId: number, purpose?: string) =>
    request<CardActivityItem[]>(`/cards/${cardId}/activity`, { purpose }),
};

// Goals API
export const goalsApi = {
  getAll: (purpose?: string) => 
    request<Goal[]>('/goals', { purpose }),
  
  getById: (id: string, purpose?: string) => 
    request<Goal>(`/goals/${id}`, { purpose }),
  
  getStats: (id: string, purpose?: string) => 
    request<GoalStats>(`/goals/${id}/stats`, { purpose }),
  
  getLogs: (id: string, limit = 30, purpose?: string) => 
    request<GoalLog[]>(`/goals/${id}/logs?limit=${limit}`, { purpose }),
  
  create: (data: CreateGoalRequest, purpose?: string) =>
    request<Goal>('/goals', {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),
  
  update: (id: string, data: UpdateGoalRequest, purpose?: string) =>
    request<Goal>(`/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      purpose,
    }),
  
  logProgress: (id: string, data: CreateGoalLogRequest, purpose?: string) =>
    request<{ log: GoalLog; goal: Goal }>(`/goals/${id}/logs`, {
      method: 'POST',
      body: JSON.stringify(data),
      purpose,
    }),
  
  updateLog: (goalId: string, logId: number, data: UpdateGoalLogRequest, purpose?: string) =>
    request<{ log: GoalLog; goal: Goal }>(`/goals/${goalId}/logs/${logId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      purpose,
    }),
  
  delete: (id: string, purpose?: string) =>
    request<void>(`/goals/${id}`, { method: 'DELETE', purpose }),
};

// Weekly Summary API
export const weeklyApi = {
  getSummary: (weekStart?: string, purpose?: string) => {
    const params = weekStart ? `?weekStart=${weekStart}` : '';
    return request<WeeklySummary>(`/weekly-summary${params}`, { purpose });
  },
  submitReflection: (reflection: string, purpose = 'Submit reflection') => {
    return request<void>('/weekly-summary/reflection', {
      method: 'POST',
      body: JSON.stringify({ reflection }),
      purpose
    });
  },
};
