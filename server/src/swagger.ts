import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'The Auditor API',
      version: '1.0.0',
      description: 'High-density productivity engine API - Tasks, Goals, Expenses, Work Logs',
    },
    servers: [
      {
        url: '/api',
        description: 'API Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your Bearer token',
        },
      },
      schemas: {
        // Task schemas
        Task: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            parentId: { type: 'string', nullable: true },
            title: { type: 'string' },
            category: { type: 'string', enum: ['Work', 'Admin', 'Personal'] },
            deadline: { type: 'string', format: 'date-time', nullable: true },
            isCompleted: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            subTasks: {
              type: 'array',
              items: { $ref: '#/components/schemas/SubTask' },
            },
          },
        },
        SubTask: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            text: { type: 'string' },
            completed: { type: 'boolean' },
          },
        },
        CreateTaskRequest: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string' },
            category: { type: 'string', enum: ['Work', 'Admin', 'Personal'], default: 'Personal' },
            deadline: { type: 'string', format: 'date-time' },
            parentId: { type: 'string' },
          },
        },
        UpdateTaskRequest: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            category: { type: 'string', enum: ['Work', 'Admin', 'Personal'] },
            deadline: { type: 'string', format: 'date-time' },
            isCompleted: { type: 'boolean' },
          },
        },

        // Goal schemas
        Goal: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            parentId: { type: 'string', nullable: true },
            title: { type: 'string' },
            goalType: { type: 'string', enum: ['reading', 'frequency', 'numeric'] },
            targetValue: { type: 'integer' },
            unit: { type: 'string' },
            currentValue: { type: 'integer' },
            totalPages: { type: 'integer', nullable: true },
            currentPage: { type: 'integer' },
            frequencyPeriod: { type: 'string', enum: ['daily', 'weekly', 'monthly'], nullable: true },
            startDate: { type: 'string', format: 'date' },
            targetDate: { type: 'string', format: 'date', nullable: true },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        GoalLog: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            goalId: { type: 'string' },
            logDate: { type: 'string', format: 'date' },
            value: { type: 'integer' },
            note: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        GoalStats: {
          type: 'object',
          properties: {
            goal: { $ref: '#/components/schemas/Goal' },
            logs: { type: 'array', items: { $ref: '#/components/schemas/GoalLog' } },
            subGoals: { type: 'array', items: { $ref: '#/components/schemas/Goal' } },
            subGoalsCompleted: { type: 'integer' },
            velocity: { type: 'number', nullable: true },
            estimatedFinishDate: { type: 'string', format: 'date', nullable: true },
            daysRemaining: { type: 'integer', nullable: true },
            progressPercent: { type: 'integer' },
            streak: { type: 'integer' },
            periodProgress: {
              type: 'object',
              nullable: true,
              properties: {
                current: { type: 'integer' },
                target: { type: 'integer' },
              },
            },
          },
        },
        CreateGoalRequest: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string' },
            goalType: { type: 'string', enum: ['reading', 'frequency', 'numeric'], default: 'frequency' },
            targetValue: { type: 'integer' },
            unit: { type: 'string' },
            totalPages: { type: 'integer' },
            frequencyPeriod: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
            targetDate: { type: 'string', format: 'date' },
            parentId: { type: 'string' },
          },
        },
        CreateGoalLogRequest: {
          type: 'object',
          required: ['value'],
          properties: {
            value: { type: 'integer' },
            note: { type: 'string' },
            logDate: { type: 'string', format: 'date' },
          },
        },

        // Expense schemas
        Expense: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            amount: { type: 'number' },
            category: { type: 'string' },
            note: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateExpenseRequest: {
          type: 'object',
          required: ['amount', 'category'],
          properties: {
            amount: { type: 'number' },
            category: { type: 'string', enum: ['Food', 'Groceries', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'] },
            note: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },

        // Work Log schemas
        WorkLog: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            logDate: { type: 'string', format: 'date' },
            integrityScore: { type: 'integer', enum: [0, 1], nullable: true },
            missedOpportunityNote: { type: 'string', nullable: true },
            successNote: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateWorkLogRequest: {
          type: 'object',
          required: ['integrityScore'],
          properties: {
            logDate: { type: 'string', format: 'date' },
            integrityScore: { type: 'integer', enum: [0, 1] },
            missedOpportunityNote: { type: 'string', description: 'Required when integrityScore is 0' },
            successNote: { type: 'string' },
          },
        },

        // Weekly Summary schema
        WeeklySummary: {
          type: 'object',
          properties: {
            weekStart: { type: 'string', format: 'date' },
            weekEnd: { type: 'string', format: 'date' },
            workLogs: { type: 'array', items: { $ref: '#/components/schemas/WorkLog' } },
            expenses: { type: 'array', items: { $ref: '#/components/schemas/Expense' } },
            expensesByCategory: { type: 'object', additionalProperties: { type: 'number' } },
            totalExpenses: { type: 'number' },
            integrityRate: { type: 'integer' },
            goals: { type: 'array', items: { $ref: '#/components/schemas/Goal' } },
            missedOpportunityNotes: { type: 'array', items: { type: 'string' } },
          },
        },

        // Log Stats schema
        LogStats: {
          type: 'object',
          properties: {
            totalQueries: { type: 'integer' },
            byTable: { type: 'object', additionalProperties: { type: 'integer' } },
            byQueryType: { type: 'object', additionalProperties: { type: 'integer' } },
            byPurpose: { type: 'object', additionalProperties: { type: 'integer' } },
            avgDurationMs: { type: 'number' },
          },
        },

        // Error schema
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts', './dist/routes/*.js'],
};

export const swaggerSpec = swaggerJsdoc(options);

