import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { clerkMiddleware } from '@clerk/express';

import { initDb, queryLoggerMiddleware } from './db/index.js';
import { isClerkConfigured, requireAuth } from './middleware/auth.js';
import { swaggerSpec } from './swagger.js';
import tasksRouter from './routes/tasks.js';
import workLogsRouter from './routes/workLogs.js';
import expensesRouter from './routes/expenses.js';
import recurringExpensesRouter from './routes/recurringExpenses.js';
import tagsRouter from './routes/tags.js';
import categoriesRouter from './routes/categories.js';
import cardsRouter from './routes/cards.js';
import budgetsRouter from './routes/budgets.js';
import goalsRouter from './routes/goals.js';
import weeklyRouter from './routes/weekly.js';
import logsRouter from './routes/logs.js';
import voiceRouter from './routes/voice.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Purpose', 'X-Api-Key'],
}));
app.use(express.json());
app.use(queryLoggerMiddleware());

// Clerk parses the Authorization bearer token and attaches req.auth.
// clerkMiddleware() throws at startup without keys, so only mount it when configured;
// requireAuth still fails closed (503) in that case.
if (isClerkConfigured) {
  app.use(clerkMiddleware());
} else {
  console.warn('[Auditor API] Clerk keys missing — protected routes will respond 503 until CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are set');
}

// API Routes (all user-facing routes require a signed-in Clerk user;
// /api/voice keeps its own X-Api-Key machine-to-machine check)
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/work-logs', requireAuth, workLogsRouter);
app.use('/api/expenses', requireAuth, expensesRouter);
app.use('/api/recurring-expenses', requireAuth, recurringExpensesRouter);
app.use('/api/budgets', requireAuth, budgetsRouter);
app.use('/api/tags', requireAuth, tagsRouter);
app.use('/api/categories', requireAuth, categoriesRouter);
app.use('/api/cards', requireAuth, cardsRouter);
app.use('/api/goals', requireAuth, goalsRouter);
app.use('/api/weekly-summary', requireAuth, weeklyRouter);
app.use('/api/logs', requireAuth, logsRouter);
app.use('/api/voice', voiceRouter);

// Swagger Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customSiteTitle: 'The Auditor API Docs',
  swaggerOptions: {
    persistAuthorization: true,
  },
}));

// Swagger JSON spec
app.get('/api/docs.json', (_req, res) => {
  res.json(swaggerSpec);
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

// Initialize database and start server
async function start() {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`[Auditor API] Running on http://localhost:${PORT}`);
      console.log(`[Auditor API] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  }
}

start();
