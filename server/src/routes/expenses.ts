import { Router } from 'express';
import db from '../db/index.js';
import type { ExpenseRow } from '../types.js';
import { expenseRowToExpense } from '../types.js';

const router = Router();

// Get all expenses (with optional date range)
router.get('/', (req, res) => {
  const { start, end } = req.query;

  let query = 'SELECT * FROM expenses';
  const params: string[] = [];

  if (start && end) {
    query += ' WHERE DATE(created_at) BETWEEN ? AND ?';
    params.push(start as string, end as string);
  }

  query += ' ORDER BY created_at DESC';

  const expenses = db.prepare(query).all(...params) as ExpenseRow[];
  res.json(expenses.map(expenseRowToExpense));
});

// Create expense (Quick-Add: only amount and category required)
router.post('/', (req, res) => {
  const { amount, category, note } = req.body;

  if (amount === undefined || amount === null) {
    return res.status(400).json({ message: 'Amount is required' });
  }

  if (!category) {
    return res.status(400).json({ message: 'Category is required' });
  }

  const result = db.prepare(`
    INSERT INTO expenses (amount, category, note) VALUES (?, ?, ?)
  `).run(amount, category, note || null);

  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?')
    .get(result.lastInsertRowid) as ExpenseRow;
  
  res.status(201).json(expenseRowToExpense(expense));
});

// Delete expense
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ message: 'Expense not found' });
  }

  res.status(204).send();
});

export default router;

