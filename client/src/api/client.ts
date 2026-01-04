import type {
  Task,
  WorkLog,
  Expense,
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
  CreateGoalRequest,
  UpdateGoalRequest,
  CreateGoalLogRequest,
} from '@/types';

const API_BASE = '/api';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
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
  getAll: () => request<Task[]>('/tasks'),
  
  getById: (id: string) => request<Task>(`/tasks/${id}`),
  
  create: (data: CreateTaskRequest) =>
    request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: UpdateTaskRequest) =>
    request<Task>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  
  // SubTasks
  addSubTask: (data: CreateSubTaskRequest) =>
    request<Task>(`/tasks/${data.taskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ text: data.text }),
    }),
  
  updateSubTask: (taskId: string, subTaskId: string, data: UpdateSubTaskRequest) =>
    request<Task>(`/tasks/${taskId}/subtasks/${subTaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  
  deleteSubTask: (taskId: string, subTaskId: string) =>
    request<Task>(`/tasks/${taskId}/subtasks/${subTaskId}`, {
      method: 'DELETE',
    }),
};

// Work Logs API
export const workLogsApi = {
  getAll: () => request<WorkLog[]>('/work-logs'),
  
  getByDate: (date: string) => request<WorkLog | null>(`/work-logs/date/${date}`),
  
  getToday: () => request<WorkLog | null>('/work-logs/today'),
  
  create: (data: CreateWorkLogRequest) =>
    request<WorkLog>('/work-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: number, data: Partial<CreateWorkLogRequest>) =>
    request<WorkLog>(`/work-logs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// Expenses API
export const expensesApi = {
  getAll: () => request<Expense[]>('/expenses'),
  
  getByDateRange: (start: string, end: string) =>
    request<Expense[]>(`/expenses?start=${start}&end=${end}`),
  
  create: (data: CreateExpenseRequest) =>
    request<Expense>('/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  delete: (id: number) =>
    request<void>(`/expenses/${id}`, { method: 'DELETE' }),
};

// Goals API
export const goalsApi = {
  getAll: () => request<Goal[]>('/goals'),
  
  getById: (id: string) => request<Goal>(`/goals/${id}`),
  
  getStats: (id: string) => request<GoalStats>(`/goals/${id}/stats`),
  
  getLogs: (id: string, limit = 30) => 
    request<GoalLog[]>(`/goals/${id}/logs?limit=${limit}`),
  
  create: (data: CreateGoalRequest) =>
    request<Goal>('/goals', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  update: (id: string, data: UpdateGoalRequest) =>
    request<Goal>(`/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  
  logProgress: (id: string, data: CreateGoalLogRequest) =>
    request<{ log: GoalLog; goal: Goal }>(`/goals/${id}/logs`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  delete: (id: string) =>
    request<void>(`/goals/${id}`, { method: 'DELETE' }),
};

// Weekly Summary API
export const weeklyApi = {
  getSummary: (weekStart?: string) => {
    const params = weekStart ? `?weekStart=${weekStart}` : '';
    return request<WeeklySummary>(`/weekly-summary${params}`);
  },
};

