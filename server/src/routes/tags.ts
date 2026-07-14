import { Router, Request, Response } from 'express';
import { trackedExecute, resolveCategoryId } from '../db/index.js';
import { getUserId } from '../middleware/auth.js';
import { TagRow, tagRowToTag } from '../types.js';

const router = Router();

/**
 * @swagger
 * /tags:
 *   get:
 *     summary: List tags
 *     tags: [Tags]
 *     parameters:
 *       - in: query
 *         name: includeArchived
 *         schema: { type: string, enum: ['1'] }
 *     responses:
 *       200:
 *         description: Array of tags
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Tag' }
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const includeArchived = req.query.includeArchived === '1';
    const baseSelect = `SELECT expense_tags.id, expense_tags.name, expense_tags.category_id,
                               expense_tags.amount, expense_tags.note, expense_tags.icon, expense_tags.color,
                               expense_tags.is_archived, expense_tags.last_used_at, expense_tags.created_at,
                               c.name AS category
                        FROM expense_tags LEFT JOIN categories c ON c.id = expense_tags.category_id`;
    const sql = includeArchived
      ? `${baseSelect} WHERE expense_tags.user_id = ? ORDER BY expense_tags.last_used_at DESC, expense_tags.created_at DESC`
      : `${baseSelect} WHERE expense_tags.user_id = ? AND expense_tags.is_archived = 0 ORDER BY expense_tags.last_used_at DESC, expense_tags.created_at DESC`;
    const result = await trackedExecute({ sql, args: [userId] }, 'listTags');
    const tags = (result.rows as unknown as TagRow[]).map(tagRowToTag);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /tags/{id}:
 *   get:
 *     summary: Get one tag
 *     tags: [Tags]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Tag, content: { application/json: { schema: { $ref: '#/components/schemas/Tag' } } } }
 *       404: { description: Not found }
 */
const TAG_SELECT_WITH_CATEGORY = `SELECT expense_tags.id, expense_tags.name, expense_tags.category_id,
       expense_tags.amount, expense_tags.note, expense_tags.icon, expense_tags.color,
       expense_tags.is_archived, expense_tags.last_used_at, expense_tags.created_at,
       c.name AS category
FROM expense_tags LEFT JOIN categories c ON c.id = expense_tags.category_id
WHERE expense_tags.id = ? AND expense_tags.user_id = ?`;

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id' });
    const result = await trackedExecute(
      { sql: TAG_SELECT_WITH_CATEGORY, args: [id, userId] },
      'getTagById',
    );
    const row = (result.rows as unknown as TagRow[])[0];
    if (!row) return res.status(404).json({ message: 'Tag not found' });
    res.json(tagRowToTag(row));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /tags:
 *   post:
 *     summary: Create a tag
 *     tags: [Tags]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateTagRequest' }
 *     responses:
 *       201: { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/Tag' } } } }
 *       400: { description: Validation error }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name, category, amount, note, icon, color } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({ message: 'category is required' });
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: 'amount must be a non-negative number' });
    }
    if (typeof icon !== 'string' || icon.length === 0) {
      return res.status(400).json({ message: 'icon is required' });
    }
    if (typeof color !== 'string' || color.length === 0) {
      return res.status(400).json({ message: 'color is required' });
    }
    const categoryId = await resolveCategoryId(userId, category);

    const result = await trackedExecute(
      {
        sql: `INSERT INTO expense_tags (name, category_id, amount, note, icon, color, user_id)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [name.trim(), categoryId, amount, note ?? null, icon.trim(), color, userId],
      },
      'createTag',
    );
    const lookup = await trackedExecute(
      { sql: TAG_SELECT_WITH_CATEGORY, args: [Number(result.lastInsertRowid), userId] },
      'getTagAfterCreate',
    );
    res.status(201).json(tagRowToTag((lookup.rows as unknown as TagRow[])[0]));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /tags/{id}:
 *   put:
 *     summary: Update a tag (also used to restore archived tags via isArchived=false)
 *     tags: [Tags]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content: { application/json: { schema: { $ref: '#/components/schemas/UpdateTagRequest' } } }
 *     responses:
 *       200: { description: Updated, content: { application/json: { schema: { $ref: '#/components/schemas/Tag' } } } }
 *       400: { description: Validation error }
 *       404: { description: Not found }
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id' });

    const { name, category, amount, note, icon, color, isArchived } = req.body ?? {};
    const sets: string[] = [];
    const args: (string | number | null)[] = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'name must be non-empty string' });
      }
      sets.push('name = ?'); args.push(name.trim());
    }
    if (category !== undefined) {
      if (typeof category !== 'string' || category.length === 0) {
        return res.status(400).json({ message: 'category must be non-empty string' });
      }
      const newCategoryId = await resolveCategoryId(userId, category);
      sets.push('category_id = ?'); args.push(newCategoryId);
    }
    if (amount !== undefined) {
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ message: 'amount must be a non-negative number' });
      }
      sets.push('amount = ?'); args.push(amount);
    }
    if (note !== undefined) { sets.push('note = ?'); args.push(note ?? null); }
    if (icon !== undefined) {
      if (typeof icon !== 'string' || icon.length === 0) {
        return res.status(400).json({ message: 'icon must be non-empty string' });
      }
      sets.push('icon = ?'); args.push(icon.trim());
    }
    if (color !== undefined) {
      if (typeof color !== 'string' || color.length === 0) {
        return res.status(400).json({ message: 'color must be non-empty string' });
      }
      sets.push('color = ?'); args.push(color);
    }
    if (isArchived !== undefined) {
      if (typeof isArchived !== 'boolean') {
        return res.status(400).json({ message: 'isArchived must be boolean' });
      }
      sets.push('is_archived = ?'); args.push(isArchived ? 1 : 0);
    }
    if (sets.length === 0) return res.status(400).json({ message: 'No fields to update' });

    args.push(id, userId);
    const updateResult = await trackedExecute(
      { sql: `UPDATE expense_tags SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, args },
      'updateTag',
    );
    if (updateResult.rowsAffected === 0) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    const lookup = await trackedExecute(
      { sql: TAG_SELECT_WITH_CATEGORY, args: [id, userId] },
      'getTagAfterUpdate',
    );
    res.json(tagRowToTag((lookup.rows as unknown as TagRow[])[0]));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /tags/{id}:
 *   delete:
 *     summary: Soft-delete (archive) a tag
 *     tags: [Tags]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       204: { description: Archived }
 *       404: { description: Not found }
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id' });
    const result = await trackedExecute(
      { sql: 'UPDATE expense_tags SET is_archived = 1 WHERE id = ? AND user_id = ?', args: [id, userId] },
      'archiveTag',
    );
    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
