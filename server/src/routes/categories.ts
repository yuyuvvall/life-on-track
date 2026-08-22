import { Router, Request, Response } from 'express';
import type { InValue } from '@libsql/client';
import { trackedExecute, ensureUserCategories } from '../db/index.js';
import { getUserId } from '../middleware/auth.js';
import { CategoryRow, categoryRowToCategory } from '../types.js';
import { sendError } from '../errors.js';

const router = Router();

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

async function loadCategoryRow(id: number, userId: string): Promise<CategoryRow | null> {
  const result = await trackedExecute(
    { sql: 'SELECT * FROM categories WHERE id = ? AND user_id = ?', args: [id, userId] },
    'getCategoryById',
  );
  return (result.rows[0] as unknown as CategoryRow | undefined) ?? null;
}

/**
 * @swagger
 * /categories:
 *   get:
 *     summary: List expense categories
 *     tags: [Categories]
 *     parameters:
 *       - in: query
 *         name: includeArchived
 *         schema: { type: string, enum: ['1'] }
 *     responses:
 *       200:
 *         description: Array of categories
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    await ensureUserCategories(userId);
    const includeArchived = req.query.includeArchived === '1';
    const sql = includeArchived
      ? 'SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order ASC, id ASC'
      : 'SELECT * FROM categories WHERE user_id = ? AND is_archived = 0 ORDER BY sort_order ASC, id ASC';
    const result = await trackedExecute({ sql, args: [userId] }, 'listCategories');
    const rows = result.rows as unknown as CategoryRow[];
    res.json(rows.map(categoryRowToCategory));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /categories/{id}:
 *   get:
 *     summary: Get a category by id with its dependents counts
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Category with dependents payload }
 *       404: { description: Not found }
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const row = await loadCategoryRow(id, userId);
    if (!row) return res.status(404).json({ message: 'Category not found' });

    // Compute live dependents counts so the UI can warn before archiving.
    const recurring = await trackedExecute(
      { sql: 'SELECT COUNT(*) AS c FROM recurring_expenses WHERE category_id = ? AND user_id = ? AND is_active = 1', args: [id, userId] },
      'countActiveRecurringForCategory',
    );
    const currentMonth = new Date().toISOString().slice(0, 7);
    const budgets = await trackedExecute(
      { sql: 'SELECT COUNT(*) AS c FROM category_budgets WHERE category_id = ? AND user_id = ? AND month >= ?', args: [id, userId, currentMonth] },
      'countActiveBudgetsForCategory',
    );
    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    const since = last30.toISOString();
    const expensesRecent = await trackedExecute(
      { sql: 'SELECT COUNT(*) AS c FROM expenses WHERE category_id = ? AND user_id = ? AND created_at >= ?', args: [id, userId, since] },
      'countRecentExpensesForCategory',
    );

    res.json({
      ...categoryRowToCategory(row),
      dependents: {
        activeRecurring: Number((recurring.rows[0] as unknown as { c: number }).c),
        activeBudgets: Number((budgets.rows[0] as unknown as { c: number }).c),
        expensesLast30Days: Number((expensesRecent.rows[0] as unknown as { c: number }).c),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /categories:
 *   post:
 *     summary: Create a category
 *     tags: [Categories]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, icon, color]
 *             properties:
 *               name: { type: string }
 *               icon: { type: string }
 *               color: { type: string, pattern: '^#[0-9a-fA-F]{6}$' }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 *       409: { description: Duplicate name }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name, icon, color } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (typeof icon !== 'string' || icon.trim().length === 0) {
      return res.status(400).json({ message: 'icon is required' });
    }
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
      return res.status(400).json({ message: 'color must be a #RRGGBB hex string' });
    }

    const trimmedName = name.trim();
    const existing = await trackedExecute(
      { sql: 'SELECT id FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1', args: [userId, trimmedName] },
      'checkCategoryNameUnique',
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'A category with this name already exists' });
    }

    const maxResult = await trackedExecute(
      { sql: 'SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories WHERE user_id = ?', args: [userId] },
      'getMaxCategorySortOrder',
    );
    const nextOrder = Number((maxResult.rows[0] as unknown as { m: number }).m) + 1;

    const insert = await trackedExecute(
      {
        sql: 'INSERT INTO categories (name, icon, color, sort_order, is_system, user_id) VALUES (?, ?, ?, ?, 0, ?)',
        args: [trimmedName, icon.trim(), color, nextOrder, userId],
      },
      'createCategory',
    );
    const row = await loadCategoryRow(Number(insert.lastInsertRowid), userId);
    if (!row) return res.status(500).json({ message: 'Failed to load created category' });
    res.status(201).json(categoryRowToCategory(row));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /categories/{id}:
 *   put:
 *     summary: Update a category (name/icon/color/sort_order/is_archived). Renames are global.
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Updated }
 *       400: { description: Validation error }
 *       403: { description: System category cannot be renamed/archived }
 *       404: { description: Not found }
 *       409: { description: Duplicate name }
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const existing = await loadCategoryRow(id, userId);
    if (!existing) return res.status(404).json({ message: 'Category not found' });

    const { name, icon, color, sortOrder, isArchived } = req.body ?? {};
    const sets: string[] = [];
    const args: InValue[] = [];

    if (name !== undefined) {
      if (existing.is_system === 1) {
        return res.status(403).json({ message: 'System category cannot be renamed' });
      }
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'name must be a non-empty string' });
      }
      const trimmedName = name.trim();
      // Reject duplicates (case-insensitive), allowing a no-op rename to the same row.
      const dup = await trackedExecute(
        { sql: 'SELECT id FROM categories WHERE user_id = ? AND LOWER(name) = LOWER(?) AND id != ? LIMIT 1', args: [userId, trimmedName, id] },
        'checkCategoryRenameUnique',
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ message: 'A category with this name already exists' });
      }
      sets.push('name = ?'); args.push(trimmedName);
    }
    if (icon !== undefined) {
      if (typeof icon !== 'string' || icon.trim().length === 0) {
        return res.status(400).json({ message: 'icon must be a non-empty string' });
      }
      sets.push('icon = ?'); args.push(icon.trim());
    }
    if (color !== undefined) {
      if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
        return res.status(400).json({ message: 'color must be a #RRGGBB hex string' });
      }
      sets.push('color = ?'); args.push(color);
    }
    if (sortOrder !== undefined) {
      if (!Number.isInteger(sortOrder)) {
        return res.status(400).json({ message: 'sortOrder must be an integer' });
      }
      sets.push('sort_order = ?'); args.push(sortOrder);
    }
    if (isArchived !== undefined) {
      if (typeof isArchived !== 'boolean') {
        return res.status(400).json({ message: 'isArchived must be a boolean' });
      }
      if (isArchived === true && existing.is_system === 1) {
        return res.status(403).json({ message: 'System category cannot be archived' });
      }
      sets.push('is_archived = ?'); args.push(isArchived ? 1 : 0);
    }

    if (sets.length === 0) return res.status(400).json({ message: 'No fields to update' });

    args.push(id, userId);
    await trackedExecute(
      { sql: `UPDATE categories SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, args },
      'updateCategory',
    );

    // Renames are global. Reads on expenses/recurring_expenses/expense_tags JOIN
    // through categories so they pick up the new name automatically. category_budgets
    // still keeps a denormalized `category` text column (kept for its UNIQUE(category, month)
    // constraint), so update it explicitly.
    if (name !== undefined) {
      const trimmedName = (name as string).trim();
      await trackedExecute(
        { sql: 'UPDATE category_budgets SET category = ? WHERE category_id = ? AND user_id = ?', args: [trimmedName, id, userId] },
        'cascadeRenameToBudgets',
      );
    }

    const updated = await loadCategoryRow(id, userId);
    if (!updated) return res.status(500).json({ message: 'Failed to load updated category' });
    res.json(categoryRowToCategory(updated));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /categories/{id}:
 *   delete:
 *     summary: Soft-delete (archive) a category. System categories rejected with 403.
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Archived }
 *       403: { description: System category cannot be archived }
 *       404: { description: Not found }
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const existing = await loadCategoryRow(id, userId);
    if (!existing) return res.status(404).json({ message: 'Category not found' });
    if (existing.is_system === 1) {
      return res.status(403).json({ message: 'System category cannot be archived' });
    }

    await trackedExecute(
      { sql: 'UPDATE categories SET is_archived = 1 WHERE id = ? AND user_id = ?', args: [id, userId] },
      'archiveCategory',
    );
    res.status(204).send();
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
