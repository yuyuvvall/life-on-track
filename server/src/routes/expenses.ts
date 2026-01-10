import { Router } from 'express';
import { trackedExecute } from '../db/index.js';
import type { ExpenseRow } from '../types.js';
import { expenseRowToExpense } from '../types.js';

const router = Router();

/**
 * @swagger
 * /expenses:
 *   get:
 *     summary: Get all expenses
 *     tags: [Expenses]
 *     parameters:
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for range filter
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for range filter
 *     responses:
 *       200:
 *         description: List of expenses
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Expense'
 */
router.get('/', async (req, res) => {
  try {
    const { start, end } = req.query;

    let result;
    if (start && end) {
      result = await trackedExecute({
        sql: 'SELECT * FROM expenses WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY created_at DESC',
        args: [start as string, end as string]
      }, 'getExpensesByDateRange');
    } else {
      result = await trackedExecute('SELECT * FROM expenses ORDER BY created_at DESC', 'getAllExpenses');
    }

    const expenses = result.rows as unknown as ExpenseRow[];
    res.json(expenses.map(expenseRowToExpense));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /expenses:
 *   post:
 *     summary: Create a new expense (Quick-Add)
 *     tags: [Expenses]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateExpenseRequest'
 *     responses:
 *       201:
 *         description: Expense created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Expense'
 *       400:
 *         description: Amount and category are required
 */
router.post('/', async (req, res) => {
  try {
    const { amount, category, note, createdAt } = req.body;

    if (amount === undefined || amount === null) {
      return res.status(400).json({ message: 'Amount is required' });
    }

    if (!category) {
      return res.status(400).json({ message: 'Category is required' });
    }

    // Use provided date or default to now
    const timestamp = createdAt || new Date().toISOString();

    const result = await trackedExecute({
      sql: 'INSERT INTO expenses (amount, category, note, created_at) VALUES (?, ?, ?, ?)',
      args: [amount, category, note || null, timestamp]
    }, 'createExpense');

    const expenseResult = await trackedExecute({
      sql: 'SELECT * FROM expenses WHERE id = ?',
      args: [Number(result.lastInsertRowid)]
    }, 'getCreatedExpense');
    const expense = expenseResult.rows[0] as unknown as ExpenseRow;
    
    res.status(201).json(expenseRowToExpense(expense));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /expenses/{id}:
 *   delete:
 *     summary: Delete an expense
 *     tags: [Expenses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Expense deleted
 *       404:
 *         description: Expense not found
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await trackedExecute({
      sql: 'DELETE FROM expenses WHERE id = ?',
      args: [req.params.id]
    }, 'deleteExpense');

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
