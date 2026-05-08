import { Router, Request, Response } from 'express';
import { trackedExecute } from '../db/index.js';
import { CategoryRow, categoryRowToCategory } from '../types.js';

const router = Router();

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
    const includeArchived = req.query.includeArchived === '1';
    const sql = includeArchived
      ? 'SELECT * FROM categories ORDER BY sort_order ASC, id ASC'
      : 'SELECT * FROM categories WHERE is_archived = 0 ORDER BY sort_order ASC, id ASC';
    const result = await trackedExecute(sql, 'listCategories');
    const rows = result.rows as unknown as CategoryRow[];
    res.json(rows.map(categoryRowToCategory));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
