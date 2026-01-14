import type {
  Task,
  WorkLog,
  Expense,
  RecurringExpense,
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
  CreateRecurringExpenseRequest,
  UpdateRecurringExpenseRequest,
  CreateGoalRequest,
  UpdateGoalRequest,
  CreateGoalLogRequest,
  UpdateGoalLogRequest,
} from '@/types';

// Use environment variable for production, proxy for development
const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Request options with optional purpose for logging
interface RequestOptions extends RequestInit {
  purpose?: string;
}

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
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  // Handle 204 No Content responses
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
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
};
