import { Router, Request, Response } from 'express';
import { trackedExecute, resolveCategoryId } from '../db/index.js';
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
    const includeArchived = req.query.includeArchived === '1';
    const sql = includeArchived
      ? 'SELECT * FROM expense_tags ORDER BY last_used_at DESC, created_at DESC'
      : 'SELECT * FROM expense_tags WHERE is_archived = 0 ORDER BY last_used_at DESC, created_at DESC';
    const result = await trackedExecute(sql, 'listTags');
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
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id' });
    const result = await trackedExecute(
      { sql: 'SELECT * FROM expense_tags WHERE id = ?', args: [id] },
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
    const categoryId = await resolveCategoryId(category);

    const result = await trackedExecute(
      {
        sql: `INSERT INTO expense_tags (name, category, category_id, amount, note, icon, color)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [name.trim(), category.trim(), categoryId, amount, note ?? null, icon.trim(), color],
      },
      'createTag',
    );
    const lookup = await trackedExecute(
      { sql: 'SELECT * FROM expense_tags WHERE id = ?', args: [Number(result.lastInsertRowid)] },
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
      sets.push('category = ?'); args.push(category.trim());
      const newCategoryId = await resolveCategoryId(category);
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

    args.push(id);
    const updateResult = await trackedExecute(
      { sql: `UPDATE expense_tags SET ${sets.join(', ')} WHERE id = ?`, args },
      'updateTag',
    );
    if (updateResult.rowsAffected === 0) {
      return res.status(404).json({ message: 'Tag not found' });
    }
    const lookup = await trackedExecute(
      { sql: 'SELECT * FROM expense_tags WHERE id = ?', args: [id] },
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
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id' });
    const result = await trackedExecute(
      { sql: 'UPDATE expense_tags SET is_archived = 1 WHERE id = ?', args: [id] },
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
