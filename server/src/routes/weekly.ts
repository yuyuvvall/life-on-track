import { Router } from 'express';
import db, { getWeekStart, getWeekEnd } from '../db/index.js';
import type { WorkLogRow, ExpenseRow, GoalRow, WeeklySummary } from '../types.js';
import { workLogRowToWorkLog, expenseRowToExpense, goalRowToGoal } from '../types.js';

const router = Router();

// Get weekly summary
router.get('/', async (req, res) => {
  try {
    const weekStart = (req.query.weekStart as string) || getWeekStart();
    const weekEnd = getWeekEnd(weekStart);

    // Get work logs for the week
    const workLogsResult = await db.execute({
      sql: `SELECT * FROM work_logs 
            WHERE log_date BETWEEN ? AND ?
            ORDER BY log_date ASC`,
      args: [weekStart, weekEnd]
    });
    const workLogs = workLogsResult.rows as unknown as WorkLogRow[];

    // Get expenses for the week
    const expensesResult = await db.execute({
      sql: `SELECT * FROM expenses 
            WHERE DATE(created_at) BETWEEN ? AND ?
            ORDER BY created_at DESC`,
      args: [weekStart, weekEnd]
    });
    const expenses = expensesResult.rows as unknown as ExpenseRow[];

    // Calculate expenses by category
    const expensesByCategory: Record<string, number> = {};
    let totalExpenses = 0;
    
    expenses.forEach((exp) => {
      expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + exp.amount;
      totalExpenses += exp.amount;
    });

    // Calculate integrity rate
    const logsWithScore = workLogs.filter((l) => l.integrity_score !== null);
    const successfulLogs = logsWithScore.filter((l) => l.integrity_score === 1);
    const integrityRate = logsWithScore.length > 0 
      ? (successfulLogs.length / logsWithScore.length) * 100 
      : 0;

    // Get missed opportunity notes for auto-population
    const missedOpportunityNotes = workLogs
      .filter((l) => l.integrity_score === 0 && l.missed_opportunity_note)
      .map((l) => l.missed_opportunity_note as string);

    // Get goals with progress
    const goalsResult = await db.execute('SELECT * FROM goals WHERE is_active = 1');
    const goals = goalsResult.rows as unknown as GoalRow[];

    const summary: WeeklySummary = {
      weekStart,
      weekEnd,
      workLogs: workLogs.map(workLogRowToWorkLog),
      expenses: expenses.map(expenseRowToExpense),
      expensesByCategory,
      totalExpenses,
      integrityRate: Math.round(integrityRate),
      goals: goals.map(goalRowToGoal),
      missedOpportunityNotes,
    };

    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
