import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { initDb } from './db/index.js';
import tasksRouter from './routes/tasks.js';
import workLogsRouter from './routes/workLogs.js';
import expensesRouter from './routes/expenses.js';
import goalsRouter from './routes/goals.js';
import weeklyRouter from './routes/weekly.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json());

// API Routes
app.use('/api/tasks', tasksRouter);
app.use('/api/work-logs', workLogsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/weekly-summary', weeklyRouter);

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
