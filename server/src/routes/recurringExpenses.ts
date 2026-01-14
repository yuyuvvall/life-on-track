import { Router } from 'express';
import type { InValue } from '@libsql/client';
import { trackedExecute } from '../db/index.js';
import type { RecurringExpenseRow, ExpenseRow } from '../types.js';
import { recurringExpenseRowToRecurringExpense, expenseRowToExpense } from '../types.js';

const router = Router();

/**
 * @swagger
 * /recurring-expenses:
 *   get:
 *     summary: Get all recurring expense templates
 *     tags: [Recurring Expenses]
 *     responses:
 *       200:
 *         description: List of recurring expenses
 */
router.get('/', async (_req, res) => {
  try {
    const result = await trackedExecute(
      'SELECT * FROM recurring_expenses ORDER BY created_at DESC',
      'getAllRecurringExpenses'
    );

    const recurringExpenses = result.rows as unknown as RecurringExpenseRow[];
    res.json(recurringExpenses.map(recurringExpenseRowToRecurringExpense));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /recurring-expenses:
 *   post:
 *     summary: Create a new recurring expense template
 *     tags: [Recurring Expenses]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - category
 *               - recurrenceType
 *               - recurrenceDay
 *             properties:
 *               amount:
 *                 type: number
 *               category:
 *                 type: string
 *               note:
 *                 type: string
 *               recurrenceType:
 *                 type: string
 *                 enum: [weekly, monthly]
 *               recurrenceDay:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Recurring expense created
 *       400:
 *         description: Invalid input
 */
router.post('/', async (req, res) => {
  try {
    const { amount, category, note, recurrenceType, recurrenceDay } = req.body;

    if (amount === undefined || amount === null) {
      return res.status(400).json({ message: 'Amount is required' });
    }

    if (!category) {
      return res.status(400).json({ message: 'Category is required' });
    }

    if (!recurrenceType || !['weekly', 'monthly'].includes(recurrenceType)) {
      return res.status(400).json({ message: 'Valid recurrence type (weekly/monthly) is required' });
    }

    if (recurrenceDay === undefined || recurrenceDay === null) {
      return res.status(400).json({ message: 'Recurrence day is required' });
    }

    // Validate recurrence day based on type
    if (recurrenceType === 'weekly' && (recurrenceDay < 0 || recurrenceDay > 6)) {
      return res.status(400).json({ message: 'Weekly recurrence day must be 0-6 (Mon-Sun)' });
    }

    if (recurrenceType === 'monthly' && (recurrenceDay < 1 || recurrenceDay > 31)) {
      return res.status(400).json({ message: 'Monthly recurrence day must be 1-31' });
    }

    const result = await trackedExecute({
      sql: `INSERT INTO recurring_expenses (amount, category, note, recurrence_type, recurrence_day) 
            VALUES (?, ?, ?, ?, ?)`,
      args: [amount, category, note || null, recurrenceType, recurrenceDay]
    }, 'createRecurringExpense');

    const recurringResult = await trackedExecute({
      sql: 'SELECT * FROM recurring_expenses WHERE id = ?',
      args: [Number(result.lastInsertRowid)]
    }, 'getCreatedRecurringExpense');
    
    const recurringExpense = recurringResult.rows[0] as unknown as RecurringExpenseRow;
    res.status(201).json(recurringExpenseRowToRecurringExpense(recurringExpense));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /recurring-expenses/{id}:
 *   put:
 *     summary: Update a recurring expense template
 *     tags: [Recurring Expenses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               category:
 *                 type: string
 *               note:
 *                 type: string
 *               recurrenceType:
 *                 type: string
 *               recurrenceDay:
 *                 type: integer
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Recurring expense updated
 *       404:
 *         description: Not found
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, category, note, recurrenceType, recurrenceDay, isActive } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const args: InValue[] = [];

    if (amount !== undefined) {
      updates.push('amount = ?');
      args.push(amount);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      args.push(category);
    }
    if (note !== undefined) {
      updates.push('note = ?');
      args.push(note);
    }
    if (recurrenceType !== undefined) {
      updates.push('recurrence_type = ?');
      args.push(recurrenceType);
    }
    if (recurrenceDay !== undefined) {
      updates.push('recurrence_day = ?');
      args.push(recurrenceDay);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      args.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    args.push(id);

    const result = await trackedExecute({
      sql: `UPDATE recurring_expenses SET ${updates.join(', ')} WHERE id = ?`,
      args
    }, 'updateRecurringExpense');

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Recurring expense not found' });
    }

    const updatedResult = await trackedExecute({
      sql: 'SELECT * FROM recurring_expenses WHERE id = ?',
      args: [id]
    }, 'getUpdatedRecurringExpense');

    const recurringExpense = updatedResult.rows[0] as unknown as RecurringExpenseRow;
    res.json(recurringExpenseRowToRecurringExpense(recurringExpense));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /recurring-expenses/{id}:
 *   delete:
 *     summary: Delete a recurring expense template
 *     tags: [Recurring Expenses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await trackedExecute({
      sql: 'DELETE FROM recurring_expenses WHERE id = ?',
      args: [req.params.id]
    }, 'deleteRecurringExpense');

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Recurring expense not found' });
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /recurring-expenses/generate:
 *   post:
 *     summary: Generate due recurring expenses
 *     tags: [Recurring Expenses]
 *     description: Checks all active recurring expenses and generates actual expense records for any that are due
 *     responses:
 *       200:
 *         description: Generation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 generated:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Expense'
 */
router.post('/generate', async (_req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeek = (today.getDay() + 6) % 7; // Convert to Mon=0, Sun=6
    const dayOfMonth = today.getDate();

    // Get all active recurring expenses
    const result = await trackedExecute(
      'SELECT * FROM recurring_expenses WHERE is_active = 1',
      'getActiveRecurringExpenses'
    );

    const recurringExpenses = result.rows as unknown as RecurringExpenseRow[];
    const generatedExpenses: ExpenseRow[] = [];

    for (const recurring of recurringExpenses) {
      let shouldGenerate = false;

      // Check if this recurring expense should generate today
      if (recurring.recurrence_type === 'weekly') {
        shouldGenerate = recurring.recurrence_day === dayOfWeek;
      } else if (recurring.recurrence_type === 'monthly') {
        // Handle end-of-month edge case (e.g., if recurrence_day is 31 but month only has 30 days)
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const effectiveDay = Math.min(recurring.recurrence_day, lastDayOfMonth);
        shouldGenerate = dayOfMonth === effectiveDay;
      }

      // Only generate if not already generated today
      if (shouldGenerate && recurring.last_generated_date !== todayStr) {
        // Create the actual expense
        const expenseResult = await trackedExecute({
          sql: 'INSERT INTO expenses (amount, category, note, created_at) VALUES (?, ?, ?, ?)',
          args: [recurring.amount, recurring.category, recurring.note, today.toISOString()]
        }, 'createExpenseFromRecurring');

        // Update last_generated_date
        await trackedExecute({
          sql: 'UPDATE recurring_expenses SET last_generated_date = ? WHERE id = ?',
          args: [todayStr, recurring.id]
        }, 'updateRecurringExpenseLastGenerated');

        // Fetch the created expense
        const createdExpense = await trackedExecute({
          sql: 'SELECT * FROM expenses WHERE id = ?',
          args: [Number(expenseResult.lastInsertRowid)]
        }, 'getGeneratedExpense');

        generatedExpenses.push(createdExpense.rows[0] as unknown as ExpenseRow);
      }
    }

    res.json({
      generated: generatedExpenses.map(expenseRowToExpense),
      count: generatedExpenses.length,
    });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
