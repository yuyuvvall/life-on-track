import { Router, Request, Response } from 'express';
import type { InValue } from '@libsql/client';
import db, { trackedExecute, withWriteLock } from '../db/index.js';
import { getUserId } from '../middleware/auth.js';
import {
  PrepaidCardRow,
  CardLoadRow,
  cardLoadRowToCardLoad,
  PrepaidCard,
} from '../types.js';
import { getCardSummary, round2 } from '../services/cardLedger.js';
import { sendError } from '../errors.js';

const router = Router();

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

async function loadCardRow(id: number, userId: string): Promise<PrepaidCardRow | null> {
  const result = await trackedExecute(
    { sql: 'SELECT * FROM prepaid_cards WHERE id = ? AND user_id = ?', args: [id, userId] },
    'getCardById',
  );
  return (result.rows[0] as unknown as PrepaidCardRow | undefined) ?? null;
}

/** Combine a card row with its derived ledger figures into the API shape. */
async function toPrepaidCard(row: PrepaidCardRow): Promise<PrepaidCard> {
  const summary = await getCardSummary(row.id);
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    defaultDiscountRate: row.default_discount_rate,
    isArchived: Boolean(row.is_archived),
    createdAt: row.created_at,
    balance: summary.balance,
    realValueRemaining: summary.realValueRemaining,
    lifetimeSavings: summary.lifetimeSavings,
  };
}

function validateRate(rate: unknown): number | null {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate >= 1) return null;
  return rate;
}

/**
 * @swagger
 * /cards:
 *   get:
 *     summary: List prepaid cards (with derived balance and savings)
 *     tags: [Cards]
 *     parameters:
 *       - in: query
 *         name: includeArchived
 *         schema: { type: string, enum: ['1'] }
 *     responses:
 *       200: { description: Array of prepaid cards }
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const includeArchived = req.query.includeArchived === '1';
    const sql = includeArchived
      ? 'SELECT * FROM prepaid_cards WHERE user_id = ? ORDER BY is_archived ASC, id ASC'
      : 'SELECT * FROM prepaid_cards WHERE is_archived = 0 AND user_id = ? ORDER BY id ASC';
    const result = await trackedExecute({ sql, args: [userId] }, 'listCards');
    const rows = result.rows as unknown as PrepaidCardRow[];
    const cards = await Promise.all(rows.map(toPrepaidCard));
    res.json(cards);
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /cards/{id}:
 *   get:
 *     summary: Get a card with derived figures and dependents counts
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Card with dependents payload }
 *       404: { description: Not found }
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const row = await loadCardRow(id, userId);
    if (!row) return res.status(404).json({ message: 'Card not found' });

    const loads = await trackedExecute(
      { sql: 'SELECT COUNT(*) AS c FROM card_loads WHERE card_id = ?', args: [id] },
      'countLoadsForCard',
    );
    const payments = await trackedExecute(
      { sql: 'SELECT COUNT(*) AS c FROM expenses WHERE card_id = ? AND user_id = ?', args: [id, userId] },
      'countPaymentsForCard',
    );

    res.json({
      ...(await toPrepaidCard(row)),
      dependents: {
        loads: Number((loads.rows[0] as unknown as { c: number }).c),
        payments: Number((payments.rows[0] as unknown as { c: number }).c),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /cards:
 *   post:
 *     summary: Create a prepaid card
 *     tags: [Cards]
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
 *               defaultDiscountRate: { type: number, description: '0.30 = 30% off' }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Validation error }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name, icon, color, defaultDiscountRate } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (typeof icon !== 'string' || icon.trim().length === 0) {
      return res.status(400).json({ message: 'icon is required' });
    }
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
      return res.status(400).json({ message: 'color must be a #RRGGBB hex string' });
    }
    const rate = defaultDiscountRate === undefined ? 0 : validateRate(defaultDiscountRate);
    if (rate === null) {
      return res.status(400).json({ message: 'defaultDiscountRate must be a number in [0, 1)' });
    }

    const insert = await trackedExecute(
      {
        sql: 'INSERT INTO prepaid_cards (name, icon, color, default_discount_rate, user_id) VALUES (?, ?, ?, ?, ?)',
        args: [name.trim(), icon.trim(), color, rate, userId],
      },
      'createCard',
    );
    const row = await loadCardRow(Number(insert.lastInsertRowid), userId);
    if (!row) return res.status(500).json({ message: 'Failed to load created card' });
    res.status(201).json(await toPrepaidCard(row));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /cards/{id}:
 *   put:
 *     summary: Update a prepaid card. Rate changes affect future loads only.
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Updated }
 *       400: { description: Validation error }
 *       404: { description: Not found }
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const existing = await loadCardRow(id, userId);
    if (!existing) return res.status(404).json({ message: 'Card not found' });

    const { name, icon, color, defaultDiscountRate, isArchived } = req.body ?? {};
    const sets: string[] = [];
    const args: InValue[] = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: 'name must be a non-empty string' });
      }
      sets.push('name = ?'); args.push(name.trim());
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
    if (defaultDiscountRate !== undefined) {
      const rate = validateRate(defaultDiscountRate);
      if (rate === null) {
        return res.status(400).json({ message: 'defaultDiscountRate must be a number in [0, 1)' });
      }
      sets.push('default_discount_rate = ?'); args.push(rate);
    }
    if (isArchived !== undefined) {
      if (typeof isArchived !== 'boolean') {
        return res.status(400).json({ message: 'isArchived must be a boolean' });
      }
      sets.push('is_archived = ?'); args.push(isArchived ? 1 : 0);
    }

    if (sets.length === 0) return res.status(400).json({ message: 'No fields to update' });

    args.push(id, userId);
    await trackedExecute(
      { sql: `UPDATE prepaid_cards SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, args },
      'updateCard',
    );

    const updated = await loadCardRow(id, userId);
    if (!updated) return res.status(500).json({ message: 'Failed to load updated card' });
    res.json(await toPrepaidCard(updated));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /cards/{id}:
 *   delete:
 *     summary: Soft-delete (archive) a card
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       204: { description: Archived }
 *       404: { description: Not found }
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const existing = await loadCardRow(id, userId);
    if (!existing) return res.status(404).json({ message: 'Card not found' });

    await trackedExecute(
      { sql: 'UPDATE prepaid_cards SET is_archived = 1 WHERE id = ? AND user_id = ?', args: [id, userId] },
      'archiveCard',
    );
    res.status(204).send();
  } catch (err) {
    sendError(res, err);
  }
});

// ── Loads ────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /cards/{id}/loads:
 *   get:
 *     summary: List a card's loads (the bank-reconciliation list), newest first
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Array of loads }
 */
router.get('/:id/loads', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const card = await loadCardRow(id, userId);
    if (!card) return res.status(404).json({ message: 'Card not found' });

    const result = await trackedExecute(
      { sql: 'SELECT * FROM card_loads WHERE card_id = ? ORDER BY loaded_at DESC, id DESC', args: [id] },
      'listCardLoads',
    );
    const rows = result.rows as unknown as CardLoadRow[];
    res.json(rows.map(cardLoadRowToCardLoad));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /cards/{id}/loads:
 *   post:
 *     summary: Load funds onto a card (cash -> balance). Bank is charged here.
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cashPaid]
 *             properties:
 *               cashPaid: { type: number, description: 'What the bank charged, e.g. 700' }
 *               discountRate: { type: number, description: 'Defaults to the card default; 0.30 = 30%' }
 *               faceValue: { type: number, description: 'Optional explicit balance received; overrides the rate' }
 *               loadedAt: { type: string, format: date-time }
 *               note: { type: string }
 *     responses:
 *       201: { description: Load created }
 *       400: { description: Validation error }
 *       404: { description: Card not found }
 */
router.post('/:id/loads', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const card = await loadCardRow(id, userId);
    if (!card) return res.status(404).json({ message: 'Card not found' });

    const { cashPaid, discountRate, faceValue, loadedAt, note } = req.body ?? {};

    if (typeof cashPaid !== 'number' || !Number.isFinite(cashPaid) || cashPaid < 0) {
      return res.status(400).json({ message: 'cashPaid must be a non-negative number' });
    }

    let faceVal: number;
    let rateStored: number;

    if (faceValue !== undefined && faceValue !== null) {
      // Explicit balance received — derive the effective rate from it.
      if (typeof faceValue !== 'number' || !Number.isFinite(faceValue) || faceValue <= 0) {
        return res.status(400).json({ message: 'faceValue must be a positive number' });
      }
      if (faceValue + 1e-9 < cashPaid) {
        return res.status(400).json({ message: 'faceValue cannot be less than cashPaid' });
      }
      faceVal = round2(faceValue);
      rateStored = round2(1 - cashPaid / faceValue);
    } else {
      // Cash -> balance: use the rate (provided or card default) to compute the balance.
      const rate = discountRate === undefined ? card.default_discount_rate : validateRate(discountRate);
      if (rate === null) {
        return res.status(400).json({ message: 'discountRate must be a number in [0, 1)' });
      }
      faceVal = round2(cashPaid / (1 - rate));
      rateStored = rate;
    }

    const timestamp = loadedAt || new Date().toISOString();

    // Under the same lock the expense routes take, so a load never lands between
    // a purchase reading this card's tranches and drawing them down.
    const insert = await withWriteLock(userId, () =>
      trackedExecute(
        {
          sql: `INSERT INTO card_loads (card_id, cash_paid, face_value, discount_rate, face_remaining, note, loaded_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [id, cashPaid, faceVal, rateStored, faceVal, note?.trim() || null, timestamp],
        },
        'createCardLoad',
      ),
    );

    const loadResult = await trackedExecute(
      { sql: 'SELECT * FROM card_loads WHERE id = ?', args: [Number(insert.lastInsertRowid)] },
      'getCreatedCardLoad',
    );
    const loadRow = loadResult.rows[0] as unknown as CardLoadRow;
    const updatedCard = await loadCardRow(id, userId);

    res.status(201).json({
      load: cardLoadRowToCardLoad(loadRow),
      card: updatedCard ? await toPrepaidCard(updatedCard) : null,
    });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /cards/{id}/loads/{loadId}:
 *   put:
 *     summary: Edit a load. Allowed only while the tranche is untouched (nothing spent from it).
 *     tags: [Cards]
 *     responses:
 *       200: { description: Updated }
 *       409: { description: Load already partly spent }
 */
router.put('/:id/loads/:loadId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    const loadId = Number(req.params.loadId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(loadId) || loadId <= 0) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const card = await loadCardRow(id, userId);
    if (!card) return res.status(404).json({ message: 'Card not found' });

    const existing = await trackedExecute(
      { sql: 'SELECT * FROM card_loads WHERE id = ? AND card_id = ?', args: [loadId, id] },
      'getCardLoadForEdit',
    );
    const row = existing.rows[0] as unknown as CardLoadRow | undefined;
    if (!row) return res.status(404).json({ message: 'Load not found' });
    if (Math.abs(row.face_remaining - row.face_value) > 1e-9) {
      return res.status(409).json({ message: 'This load has already been partly spent and cannot be edited. Adjust the purchases first.' });
    }

    const { cashPaid, discountRate, faceValue, loadedAt, note } = req.body ?? {};
    const next = {
      cashPaid: typeof cashPaid === 'number' ? cashPaid : row.cash_paid,
      note: note !== undefined ? (note?.trim() || null) : row.note,
      loadedAt: loadedAt || row.loaded_at,
    };
    if (typeof next.cashPaid !== 'number' || !Number.isFinite(next.cashPaid) || next.cashPaid < 0) {
      return res.status(400).json({ message: 'cashPaid must be a non-negative number' });
    }

    let faceVal: number;
    let rateStored: number;
    if (faceValue !== undefined && faceValue !== null) {
      if (typeof faceValue !== 'number' || faceValue <= 0 || faceValue + 1e-9 < next.cashPaid) {
        return res.status(400).json({ message: 'faceValue must be a positive number >= cashPaid' });
      }
      faceVal = round2(faceValue);
      rateStored = round2(1 - next.cashPaid / faceValue);
    } else {
      const rate = discountRate === undefined ? row.discount_rate : validateRate(discountRate);
      if (rate === null) return res.status(400).json({ message: 'discountRate must be a number in [0, 1)' });
      faceVal = round2(next.cashPaid / (1 - rate));
      rateStored = rate;
    }

    // The write lock keeps a purchase from being planned against this tranche
    // while we rewrite it; the WHERE clause re-asserts "untouched" for anything
    // that reached the database without going through this process. Both matter:
    // this statement rewrites face_remaining from scratch, so a drawdown it
    // doesn't see is a drawdown silently erased.
    const updateResult = await withWriteLock(userId, () =>
      trackedExecute(
        {
          sql: `UPDATE card_loads SET cash_paid = ?, face_value = ?, discount_rate = ?, face_remaining = ?, note = ?, loaded_at = ?
              WHERE id = ? AND ABS(face_remaining - face_value) <= 1e-9`,
          args: [next.cashPaid, faceVal, rateStored, faceVal, next.note, next.loadedAt, loadId],
        },
        'updateCardLoad',
      ),
    );
    if (updateResult.rowsAffected === 0) {
      return res.status(409).json({ message: 'This load has already been partly spent and cannot be edited. Adjust the purchases first.' });
    }

    const updated = await trackedExecute(
      { sql: 'SELECT * FROM card_loads WHERE id = ?', args: [loadId] },
      'getUpdatedCardLoad',
    );
    res.json(cardLoadRowToCardLoad(updated.rows[0] as unknown as CardLoadRow));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /cards/{id}/loads/{loadId}:
 *   delete:
 *     summary: Delete a load. Allowed only while the tranche is untouched.
 *     tags: [Cards]
 *     responses:
 *       204: { description: Deleted }
 *       409: { description: Load already partly spent }
 */
router.delete('/:id/loads/:loadId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    const loadId = Number(req.params.loadId);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(loadId) || loadId <= 0) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    const card = await loadCardRow(id, userId);
    if (!card) return res.status(404).json({ message: 'Card not found' });

    const existing = await trackedExecute(
      { sql: 'SELECT * FROM card_loads WHERE id = ? AND card_id = ?', args: [loadId, id] },
      'getCardLoadForDelete',
    );
    const row = existing.rows[0] as unknown as CardLoadRow | undefined;
    if (!row) return res.status(404).json({ message: 'Load not found' });
    if (Math.abs(row.face_remaining - row.face_value) > 1e-9) {
      return res.status(409).json({ message: 'This load has already been partly spent and cannot be deleted. Adjust the purchases first.' });
    }

    // Same lock and compare-and-swap as the edit path: refuse to drop a tranche
    // that has been spent from, or that a purchase is being planned against.
    const deleteResult = await withWriteLock(userId, () =>
      trackedExecute(
        { sql: 'DELETE FROM card_loads WHERE id = ? AND ABS(face_remaining - face_value) <= 1e-9', args: [loadId] },
        'deleteCardLoad',
      ),
    );
    if (deleteResult.rowsAffected === 0) {
      return res.status(409).json({ message: 'This load has already been partly spent and cannot be deleted. Adjust the purchases first.' });
    }
    res.status(204).send();
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /cards/{id}/activity:
 *   get:
 *     summary: Unified chronological ledger for a card (loads + payments)
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Array of activity items (type 'load' | 'payment') }
 */
router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid id' });

    const card = await loadCardRow(id, userId);
    if (!card) return res.status(404).json({ message: 'Card not found' });

    const loadsResult = await trackedExecute(
      { sql: 'SELECT * FROM card_loads WHERE card_id = ?', args: [id] },
      'cardActivityLoads',
    );
    const paymentsResult = await trackedExecute(
      {
        sql: `SELECT e.id, e.amount, e.face_amount, e.note, e.created_at, c.name AS category
                FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
               WHERE e.card_id = ? AND e.user_id = ?`,
        args: [id, userId],
      },
      'cardActivityPayments',
    );

    const loads = (loadsResult.rows as unknown as CardLoadRow[]).map((r) => ({
      type: 'load' as const,
      id: r.id,
      at: r.loaded_at,
      cashPaid: r.cash_paid,
      faceValue: r.face_value,
      discountRate: r.discount_rate,
      note: r.note,
    }));

    const payments = (paymentsResult.rows as unknown as {
      id: number; amount: number; face_amount: number | null; note: string | null; created_at: string; category: string | null;
    }[]).map((r) => ({
      type: 'payment' as const,
      id: r.id,
      at: r.created_at,
      amount: r.amount,
      faceAmount: r.face_amount,
      category: r.category,
      note: r.note,
    }));

    const activity = [...loads, ...payments].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    res.json(activity);
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
