import { Router } from 'express';
import db, { trackedExecute, resolveCategoryId } from '../db/index.js';
import { getUserId } from '../middleware/auth.js';
import type { CategoryBudgetRow } from '../types.js';
import { budgetRowToBudget } from '../types.js';
import { sendError } from '../errors.js';

const router = Router();

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/**
 * @swagger
 * /budgets:
 *   get:
 *     summary: Get category budgets for a given month
 *     tags: [Budgets]
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *         description: Target month in YYYY-MM format
 *     responses:
 *       200:
 *         description: List of budgets in effect for the month
 *       400:
 *         description: Missing or invalid month
 */
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { month } = req.query;

    if (!month || typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
      return res.status(400).json({ message: 'month query param is required (YYYY-MM)' });
    }

    // Latest-wins: for each category, pick the row with the greatest month <= requested.
    const result = await trackedExecute({
      sql: `SELECT b.*
            FROM category_budgets b
            WHERE b.user_id = ? AND b.month = (
              SELECT MAX(month) FROM category_budgets
              WHERE user_id = ? AND category = b.category AND month <= ?
            )
            ORDER BY b.category`,
      args: [userId, userId, month]
    }, 'getBudgetsEffectiveForMonth');

    const rows = result.rows as unknown as CategoryBudgetRow[];
    res.json(rows.map(budgetRowToBudget));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /budgets:
 *   post:
 *     summary: Upsert a monthly budget for a category
 *     tags: [Budgets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, month, amount]
 *             properties:
 *               category:
 *                 type: string
 *               month:
 *                 type: string
 *                 pattern: '^\d{4}-\d{2}$'
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Budget upserted
 *       400:
 *         description: Invalid payload
 */
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { category, month, amount } = req.body;

    if (!category || typeof category !== 'string') {
      return res.status(400).json({ message: 'category is required' });
    }
    if (!month || typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
      return res.status(400).json({ message: 'month is required (YYYY-MM)' });
    }
    if (amount === undefined || amount === null || typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({ message: 'amount must be a non-negative number' });
    }

    const categoryId = await resolveCategoryId(userId, category);

    await trackedExecute({
      sql: `INSERT INTO category_budgets (category, category_id, month, amount, user_id) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, category, month) DO UPDATE SET amount = excluded.amount, category_id = excluded.category_id`,
      args: [category, categoryId, month, amount, userId]
    }, 'upsertBudget');

    const result = await trackedExecute({
      sql: 'SELECT * FROM category_budgets WHERE category = ? AND month = ? AND user_id = ?',
      args: [category, month, userId]
    }, 'getUpsertedBudget');

    const row = result.rows[0] as unknown as CategoryBudgetRow;
    res.json(budgetRowToBudget(row));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /budgets/change-from-now:
 *   post:
 *     summary: Upsert a budget at the given month AND delete any later override rows for the same category
 *     description: Use when the user wants a new amount to apply from this month forward, with no downstream overrides.
 *     tags: [Budgets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, month, amount]
 *             properties:
 *               category:
 *                 type: string
 *               month:
 *                 type: string
 *                 pattern: '^\d{4}-\d{2}$'
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Budget updated for this month onward
 *       400:
 *         description: Invalid payload
 */
router.post('/change-from-now', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { category, month, amount } = req.body;

    if (!category || typeof category !== 'string') {
      return res.status(400).json({ message: 'category is required' });
    }
    if (!month || typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
      return res.status(400).json({ message: 'month is required (YYYY-MM)' });
    }
    if (amount === undefined || amount === null || typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({ message: 'amount must be a non-negative number' });
    }

    const categoryId = await resolveCategoryId(userId, category);

    // Atomic: upsert for this month + delete any later rows for this category.
    await db.batch([
      {
        sql: `INSERT INTO category_budgets (category, category_id, month, amount, user_id) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(user_id, category, month) DO UPDATE SET amount = excluded.amount, category_id = excluded.category_id`,
        args: [category, categoryId, month, amount, userId],
      },
      {
        sql: 'DELETE FROM category_budgets WHERE category = ? AND month > ? AND user_id = ?',
        args: [category, month, userId],
      },
    ], 'write');

    const result = await trackedExecute({
      sql: 'SELECT * FROM category_budgets WHERE category = ? AND month = ? AND user_id = ?',
      args: [category, month, userId]
    }, 'getUpsertedBudget');

    const row = result.rows[0] as unknown as CategoryBudgetRow;
    res.json(budgetRowToBudget(row));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /budgets/remove-entirely:
 *   post:
 *     summary: Delete all budget rows for a category at or after the given month
 *     tags: [Budgets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, month]
 *             properties:
 *               category:
 *                 type: string
 *               month:
 *                 type: string
 *                 pattern: '^\d{4}-\d{2}$'
 *     responses:
 *       204:
 *         description: Rows deleted
 *       400:
 *         description: Invalid payload
 */
router.post('/remove-entirely', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { category, month } = req.body;

    if (!category || typeof category !== 'string') {
      return res.status(400).json({ message: 'category is required' });
    }
    if (!month || typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
      return res.status(400).json({ message: 'month is required (YYYY-MM)' });
    }

    await trackedExecute({
      sql: 'DELETE FROM category_budgets WHERE category = ? AND month >= ? AND user_id = ?',
      args: [category, month, userId]
    }, 'removeBudgetFromNowOn');

    res.status(204).send();
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /budgets/{id}:
 *   delete:
 *     summary: Delete a budget row
 *     tags: [Budgets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Budget deleted
 *       404:
 *         description: Budget not found
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await trackedExecute({
      sql: 'DELETE FROM category_budgets WHERE id = ? AND user_id = ?',
      args: [req.params.id, userId]
    }, 'deleteBudget');

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Budget not found' });
    }

    res.status(204).send();
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
