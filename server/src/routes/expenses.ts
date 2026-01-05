import { Router } from 'express';
import db from '../db/index.js';
import type { ExpenseRow } from '../types.js';
import { expenseRowToExpense } from '../types.js';

const router = Router();

// Get all expenses (with optional date range)
router.get('/', async (req, res) => {
  try {
    const { start, end } = req.query;

    let result;
    if (start && end) {
      result = await db.execute({
        sql: 'SELECT * FROM expenses WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY created_at DESC',
        args: [start as string, end as string]
      });
    } else {
      result = await db.execute('SELECT * FROM expenses ORDER BY created_at DESC');
    }

    const expenses = result.rows as unknown as ExpenseRow[];
    res.json(expenses.map(expenseRowToExpense));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Create expense (Quick-Add: only amount and category required)
router.post('/', async (req, res) => {
  try {
    const { amount, category, note } = req.body;

    if (amount === undefined || amount === null) {
      return res.status(400).json({ message: 'Amount is required' });
    }

    if (!category) {
      return res.status(400).json({ message: 'Category is required' });
    }

    const result = await db.execute({
      sql: 'INSERT INTO expenses (amount, category, note) VALUES (?, ?, ?)',
      args: [amount, category, note || null]
    });

    const expenseResult = await db.execute({
      sql: 'SELECT * FROM expenses WHERE id = ?',
      args: [Number(result.lastInsertRowid)]
    });
    const expense = expenseResult.rows[0] as unknown as ExpenseRow;
    
    res.status(201).json(expenseRowToExpense(expense));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Delete expense
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'DELETE FROM expenses WHERE id = ?',
      args: [req.params.id]
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
