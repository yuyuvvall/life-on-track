import { Router } from 'express';
import { getWeekStart, getWeekEnd, trackedExecute } from '../db/index.js';
import { getUserId } from '../middleware/auth.js';
import type { WorkLogRow, ExpenseRow, GoalRow, WeeklySummary } from '../types.js';
import { workLogRowToWorkLog, expenseRowToExpense, goalRowToGoal } from '../types.js';
import { recalculateFrequencyGoalsCurrentValue } from './goals.js';
import { EXPENSE_COLUMNS } from './expenses.js';
import { sendError } from '../errors.js';

const router = Router();

/**
 * @swagger
 * /weekly-summary:
 *   get:
 *     summary: Get weekly summary
 *     tags: [Weekly Summary]
 *     parameters:
 *       - in: query
 *         name: weekStart
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date of the week (defaults to current week)
 *     responses:
 *       200:
 *         description: Weekly summary with work logs, expenses, and goals
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WeeklySummary'
 */
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const weekStart = (req.query.weekStart as string) || getWeekStart();
    const weekEnd = getWeekEnd(weekStart);

    // Get work logs for the week
    const workLogsResult = await trackedExecute({
      sql: `SELECT * FROM work_logs
            WHERE log_date BETWEEN ? AND ? AND user_id = ?
            ORDER BY log_date ASC`,
      args: [weekStart, weekEnd, userId]
    }, 'getWeeklyWorkLogs');
    const workLogs = workLogsResult.rows as unknown as WorkLogRow[];

    // Get expenses for the week (shared projection: category name, card columns
    // and repaid_total all come along)
    const expensesResult = await trackedExecute({
      sql: `SELECT ${EXPENSE_COLUMNS}
            FROM expenses LEFT JOIN categories c ON c.id = expenses.category_id
            WHERE DATE(expenses.created_at) BETWEEN ? AND ? AND expenses.user_id = ?
            ORDER BY expenses.created_at DESC`,
      args: [weekStart, weekEnd, userId]
    }, 'getWeeklyExpenses');
    const expenses = expensesResult.rows as unknown as ExpenseRow[];

    // Calculate expenses by category — net of repayments, at the expense's own date
    const expensesByCategory: Record<string, number> = {};
    let totalExpenses = 0;

    expenses.forEach((exp) => {
      const net = exp.amount - Number(exp.repaid_total ?? 0);
      expensesByCategory[exp.category] = (expensesByCategory[exp.category] || 0) + net;
      totalExpenses += net;
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
    const goalsResult = await trackedExecute({
      sql: 'SELECT * FROM goals WHERE is_active = 1 AND user_id = ?',
      args: [userId]
    }, 'getActiveGoalsForSummary');
    const goals = goalsResult.rows as unknown as GoalRow[];
    await recalculateFrequencyGoalsCurrentValue(goals);

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
    sendError(res, err);
  }
});

/**
 * @swagger
 * /weekly-summary/reflection:
 *   post:
 *     summary: Submit weekly reflection
 *     tags: [Weekly Summary]
 *     description: Stores a reflection for the current week. The week is determined server-side (Monday as week start).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reflection
 *             properties:
 *               reflection:
 *                 type: string
 *                 description: The weekly reflection text
 *     responses:
 *       200:
 *         description: Reflection submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Reflection submitted successfully
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/reflection', async (req, res) => {
  try {
    const userId = getUserId(req);
    const reflection = req.body.reflection;
    await trackedExecute({
      sql: `INSERT INTO weekly_reflections (week_start, reflection_text, user_id) VALUES (?, ?, ?)`,
      args: [getWeekStart(), reflection, userId]
    }, 'submitWeeklyReflection');
    res.json({ message: 'Reflection submitted successfully' });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
