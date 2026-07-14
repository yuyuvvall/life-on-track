import { Router } from 'express';
import type { InValue } from '@libsql/client';
import db, { trackedExecute, resolveCategoryId } from '../db/index.js';
import { getUserId } from '../middleware/auth.js';
import type { ExpenseRow, ExpenseRepaymentRow, PrepaidCardRow } from '../types.js';
import { expenseRowToExpense, repaymentRowToRepayment } from '../types.js';
import {
  planAllocation,
  planAllocationFromTranches,
  applyAllocationStatements,
  reverseStatements,
  buildReversalStatements,
  getAllocations,
  getTranches,
  round2,
} from '../services/cardLedger.js';

const router = Router();

// Shared projection so every read returns the full expense shape, including the
// prepaid-card columns. `amount` is always the real money spent; `face_amount`
// holds the price tag for card purchases (NULL for direct/cash expenses).
// `repaid_total` is a correlated subquery (not a JOIN) so the projection stays
// safe to splice into any query without GROUP BY or row multiplication.
export const EXPENSE_COLUMNS =
  'expenses.id, expenses.amount, expenses.category_id, expenses.note, ' +
  'expenses.created_at, expenses.tag_id, expenses.card_id, expenses.face_amount, c.name AS category, ' +
  'COALESCE((SELECT SUM(r.amount) FROM expense_repayments r WHERE r.expense_id = expenses.id), 0) AS repaid_total';

async function loadExpenseById(userId: string, id: number | string): Promise<ExpenseRow | undefined> {
  const result = await trackedExecute({
    sql: `SELECT ${EXPENSE_COLUMNS}
          FROM expenses LEFT JOIN categories c ON c.id = expenses.category_id
          WHERE expenses.id = ? AND expenses.user_id = ?`,
    args: [id, userId],
  }, 'getExpenseById');
  return result.rows[0] as unknown as ExpenseRow | undefined;
}

/** Validate that a card exists, belongs to the user, and is active. Returns the row or null. */
async function loadActiveCard(userId: string, cardId: number): Promise<PrepaidCardRow | null> {
  const result = await trackedExecute(
    { sql: 'SELECT * FROM prepaid_cards WHERE id = ? AND user_id = ?', args: [cardId, userId] },
    'validateCardOnExpense',
  );
  const row = result.rows[0] as unknown as PrepaidCardRow | undefined;
  if (!row || row.is_archived === 1) return null;
  return row;
}

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
    const userId = getUserId(req);
    const { start, end, categoryId } = req.query;

    let parsedCategoryId: number | null = null;
    if (categoryId !== undefined) {
      const n = Number(categoryId);
      if (!Number.isInteger(n) || n <= 0) {
        return res.status(400).json({ message: 'categoryId must be a positive integer' });
      }
      parsedCategoryId = n;
    }

    const where: string[] = ['expenses.user_id = ?'];
    const args: InValue[] = [userId];
    if (start && end) {
      where.push('DATE(created_at) BETWEEN ? AND ?');
      args.push(start as string, end as string);
    }
    if (parsedCategoryId !== null) {
      where.push('category_id = ?');
      args.push(parsedCategoryId);
    }

    const sql =
      `SELECT ${EXPENSE_COLUMNS} ` +
      'FROM expenses LEFT JOIN categories c ON c.id = expenses.category_id' +
      ` WHERE ${where.map((w) => w.replace(/category_id/g, 'expenses.category_id').replace(/created_at/g, 'expenses.created_at')).join(' AND ')}` +
      ' ORDER BY expenses.created_at DESC';

    const result = await trackedExecute(
      { sql, args },
      parsedCategoryId !== null ? 'getExpensesFiltered' : (start && end ? 'getExpensesByDateRange' : 'getAllExpenses'),
    );

    const expenses = result.rows as unknown as ExpenseRow[];
    res.json(expenses.map(expenseRowToExpense));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /expenses/{id}:
 *   get:
 *     summary: Get a single expense by ID
 *     tags: [Expenses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Expense found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Expense'
 *       404:
 *         description: Expense not found
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const expense = await loadExpenseById(userId, req.params.id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    res.json(expenseRowToExpense(expense));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── Repayments ───────────────────────────────────────────────────────────────
// Money paid back against an expense (e.g. a friend's share of a shared bill).
// The expense's `amount` stays true to the bank charge; aggregations subtract
// `repaid_total` at the expense's own date. Repayments never touch the card
// ledger — that must keep reconciling to the cash actually loaded.

const EPS = 1e-9;

/**
 * @swagger
 * /expenses/{id}/repayments:
 *   get:
 *     summary: List repayments recorded against an expense
 *     tags: [Expenses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Repayments, newest first
 *       404:
 *         description: Expense not found
 */
router.get('/:id/repayments', async (req, res) => {
  try {
    const userId = getUserId(req);
    const expense = await loadExpenseById(userId, req.params.id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    const result = await trackedExecute({
      sql: 'SELECT * FROM expense_repayments WHERE expense_id = ? ORDER BY repaid_at DESC, id DESC',
      args: [req.params.id],
    }, 'getExpenseRepayments');
    const rows = result.rows as unknown as ExpenseRepaymentRow[];
    res.json(rows.map(repaymentRowToRepayment));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /expenses/{id}/repayments:
 *   post:
 *     summary: Record a repayment against an expense
 *     tags: [Expenses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: number
 *               note:
 *                 type: string
 *               repaidAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Repayment created; returns it with the refreshed expense
 *       400:
 *         description: Invalid amount or repayment exceeds the remaining amount
 *       404:
 *         description: Expense not found
 */
router.post('/:id/repayments', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { amount, note, repaidAt } = req.body;

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Repayment amount must be a positive number' });
    }

    const expense = await loadExpenseById(userId, req.params.id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    // Repayments count against the real money spent (`amount`), never the
    // card price tag (`face_amount`).
    const repayAmount = round2(amount);
    const remaining = round2(expense.amount - Number(expense.repaid_total ?? 0));
    if (round2(Number(expense.repaid_total ?? 0) + repayAmount) > expense.amount + EPS) {
      return res.status(400).json({ message: `Repayment exceeds remaining ${remaining} on this expense` });
    }

    const result = await trackedExecute({
      sql: 'INSERT INTO expense_repayments (expense_id, amount, note, repaid_at) VALUES (?, ?, ?, ?)',
      args: [req.params.id, repayAmount, note?.trim?.() || null, repaidAt || new Date().toISOString()],
    }, 'createExpenseRepayment');

    const repaymentId = Number(result.lastInsertRowid);
    const rowResult = await trackedExecute({
      sql: 'SELECT * FROM expense_repayments WHERE id = ?',
      args: [repaymentId],
    }, 'getExpenseRepayment');
    const row = rowResult.rows[0] as unknown as ExpenseRepaymentRow;
    const refreshed = await loadExpenseById(userId, req.params.id);

    res.status(201).json({
      repayment: repaymentRowToRepayment(row),
      expense: expenseRowToExpense(refreshed as ExpenseRow),
    });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /expenses/{id}/repayments/{repaymentId}:
 *   delete:
 *     summary: Delete a repayment
 *     tags: [Expenses]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: repaymentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Repayment deleted
 *       404:
 *         description: Repayment not found
 */
router.delete('/:id/repayments/:repaymentId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await trackedExecute({
      sql: `DELETE FROM expense_repayments WHERE id = ? AND expense_id = ?
              AND EXISTS (SELECT 1 FROM expenses e WHERE e.id = expense_repayments.expense_id AND e.user_id = ?)`,
      args: [req.params.repaymentId, req.params.id, userId],
    }, 'deleteExpenseRepayment');
    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Repayment not found' });
    }
    res.status(204).send();
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
    const userId = getUserId(req);
    const { amount, category, note, createdAt, tagId, cardId } = req.body;

    if (amount === undefined || amount === null) {
      return res.status(400).json({ message: 'Amount is required' });
    }

    if (!category) {
      return res.status(400).json({ message: 'Category is required' });
    }

    let resolvedTagId: number | null = null;
    if (tagId !== undefined && tagId !== null) {
      if (!Number.isInteger(tagId)) {
        return res.status(400).json({ message: 'tagId must be an integer' });
      }
      const tagLookup = await trackedExecute(
        { sql: 'SELECT id, is_archived FROM expense_tags WHERE id = ? AND user_id = ?', args: [tagId, userId] },
        'validateTagOnExpenseCreate',
      );
      const tagRow = tagLookup.rows[0] as unknown as { id: number; is_archived: number } | undefined;
      if (!tagRow || tagRow.is_archived === 1) {
        return res.status(400).json({ message: 'Invalid or archived tagId' });
      }
      resolvedTagId = tagId;
    }

    // When paid from a prepaid card, the incoming `amount` is the price tag
    // (face value). We draw it down the card's tranches (FIFO) and store the
    // discounted real cost as `amount`, keeping the price tag in `face_amount`.
    let storedAmount = amount;
    let faceAmount: number | null = null;
    let resolvedCardId: number | null = null;
    let pendingAllocations: { loadId: number; faceConsumed: number; realCost: number }[] = [];
    if (cardId !== undefined && cardId !== null) {
      if (!Number.isInteger(cardId)) {
        return res.status(400).json({ message: 'cardId must be an integer' });
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: 'A card purchase amount must be a positive number' });
      }
      const card = await loadActiveCard(userId, cardId);
      if (!card) {
        return res.status(400).json({ message: 'Invalid or archived cardId' });
      }
      const plan = await planAllocation(cardId, amount);
      if (!plan.ok) {
        const shortfall = Math.round((amount - plan.balance) * 100) / 100;
        return res.status(400).json({ message: `Amount exceeds card balance by ${shortfall}` });
      }
      faceAmount = amount;
      storedAmount = plan.realCost;
      resolvedCardId = cardId;
      pendingAllocations = plan.allocations;
    }

    // Use provided date or default to now
    const timestamp = createdAt || new Date().toISOString();

    const categoryId = await resolveCategoryId(userId, category);

    const result = await trackedExecute({
      sql: 'INSERT INTO expenses (amount, category_id, note, created_at, tag_id, card_id, face_amount, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [storedAmount, categoryId, note || null, timestamp, resolvedTagId, resolvedCardId, faceAmount, userId]
    }, 'createExpense');

    const expenseId = Number(result.lastInsertRowid);

    // Draw down the card tranches and record which load(s) this purchase consumed.
    if (resolvedCardId !== null && pendingAllocations.length > 0) {
      await db.batch(applyAllocationStatements(expenseId, pendingAllocations), 'write');
    }

    if (resolvedTagId !== null) {
      // Best-effort; never fail the request on this.
      trackedExecute(
        { sql: 'UPDATE expense_tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', args: [resolvedTagId, userId] },
        'updateTagLastUsedAt',
      ).catch(() => {});
    }

    const expense = await loadExpenseById(userId, expenseId);
    res.status(201).json(expenseRowToExpense(expense as ExpenseRow));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /expenses/{id}:
 *   put:
 *     summary: Update an expense
 *     tags: [Expenses]
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
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *               tagId:
 *                 type: integer
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Expense updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Expense'
 *       404:
 *         description: Expense not found
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const numericId = Number(id);
    const { amount, category, note, createdAt, tagId, cardId } = req.body;

    const existing = await loadExpenseById(userId, id);
    if (!existing) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    // Build the expense-row updates plus any ledger statements (reversal of old
    // allocations and application of new ones) so the whole edit is one atomic batch.
    const updates: string[] = [];
    const args: InValue[] = [];
    const ledgerStatements: { sql: string; args: InValue[] }[] = [];

    if (category !== undefined) {
      const newCategoryId = await resolveCategoryId(userId, category);
      updates.push('category_id = ?');
      args.push(newCategoryId);
    }
    if (note !== undefined) {
      updates.push('note = ?');
      args.push(note);
    }
    if (createdAt !== undefined) {
      updates.push('created_at = ?');
      args.push(createdAt);
    }

    let pendingTagBump: number | null = null;
    if (tagId !== undefined) {
      if (tagId !== null) {
        if (!Number.isInteger(tagId)) {
          return res.status(400).json({ message: 'tagId must be an integer or null' });
        }
        const tagLookup = await trackedExecute(
          { sql: 'SELECT id, is_archived FROM expense_tags WHERE id = ? AND user_id = ?', args: [tagId, userId] },
          'validateTagOnExpenseUpdate',
        );
        const tagRow = tagLookup.rows[0] as unknown as { id: number; is_archived: number } | undefined;
        if (!tagRow || tagRow.is_archived === 1) {
          return res.status(400).json({ message: 'Invalid or archived tagId' });
        }
        pendingTagBump = tagId;
      }
      updates.push('tag_id = ?');
      args.push(tagId);
    }

    // ── Card / amount handling ────────────────────────────────────────────────
    const cardInBody = cardId !== undefined;
    if (cardInBody && cardId !== null && !Number.isInteger(cardId)) {
      return res.status(400).json({ message: 'cardId must be an integer or null' });
    }
    const effectiveCardId: number | null = cardInBody ? (cardId === null ? null : cardId) : existing.card_id;
    const amountInBody = amount !== undefined;
    const wasCard = existing.card_id != null;
    const willBeCard = effectiveCardId != null;
    const cardChanged = cardInBody && (cardId ?? null) !== (existing.card_id ?? null);
    const needsRealloc = (willBeCard && (amountInBody || cardChanged)) || (wasCard && !willBeCard);

    // The amount that will end up stored after this edit (real money), for the
    // repaid-total guard below. Only known per-branch: a card re-allocation
    // stores plan.realCost, not the face value the client sent.
    let finalStoredAmount: number | undefined;

    if (needsRealloc) {
      const origAllocs = await getAllocations(numericId);

      if (willBeCard) {
        const card = await loadActiveCard(userId, effectiveCardId as number);
        if (!card) {
          return res.status(400).json({ message: 'Invalid or archived cardId' });
        }
        // The face value to (re)allocate: the new price tag if given, otherwise
        // keep the existing one (or, for a direct→card switch, the old amount).
        const newFace = amountInBody ? amount : (existing.face_amount ?? existing.amount);
        if (typeof newFace !== 'number' || !Number.isFinite(newFace) || newFace <= 0) {
          return res.status(400).json({ message: 'A card purchase amount must be a positive number' });
        }

        // Plan against the destination card's tranches. When we're re-allocating
        // on the SAME card, first restore (in memory) the face this expense
        // already holds, so it competes for its own freed-up balance.
        const tranches = await getTranches(effectiveCardId as number);
        if (existing.card_id === effectiveCardId) {
          for (const a of origAllocs) {
            const t = tranches.find((x) => x.id === a.loadId);
            if (t) t.face_remaining += a.faceConsumed;
          }
        }
        const plan = planAllocationFromTranches(tranches, newFace);
        if (!plan.ok) {
          const shortfall = round2(newFace - plan.balance);
          return res.status(400).json({ message: `Amount exceeds card balance by ${shortfall}` });
        }

        ledgerStatements.push(...reverseStatements(numericId, origAllocs));
        ledgerStatements.push(...applyAllocationStatements(numericId, plan.allocations));
        updates.push('amount = ?'); args.push(plan.realCost);
        updates.push('face_amount = ?'); args.push(newFace);
        updates.push('card_id = ?'); args.push(effectiveCardId);
        finalStoredAmount = plan.realCost;
      } else {
        // Card → direct: give back the balance and clear the card fields. The
        // price tag becomes the plain amount unless a new amount was supplied.
        ledgerStatements.push(...reverseStatements(numericId, origAllocs));
        const newAmount = amountInBody ? amount : (existing.face_amount ?? existing.amount);
        updates.push('amount = ?'); args.push(newAmount);
        updates.push('face_amount = ?'); args.push(null);
        updates.push('card_id = ?'); args.push(null);
        finalStoredAmount = newAmount;
      }
    } else if (amountInBody) {
      // Plain amount edit on a direct expense (no card involved).
      updates.push('amount = ?');
      args.push(amount);
      finalStoredAmount = amount;
    }

    // An edit may not drop the stored amount below what's already been repaid —
    // the user must delete repayments first, keeping money history explicit.
    const repaidTotal = Number(existing.repaid_total ?? 0);
    if (finalStoredAmount !== undefined && repaidTotal > 0 && finalStoredAmount < repaidTotal - 1e-9) {
      return res.status(400).json({
        message: `New amount is below the ${round2(repaidTotal)} already repaid. Delete repayments first.`,
      });
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    args.push(id, userId);
    await db.batch(
      [{ sql: `UPDATE expenses SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, args }, ...ledgerStatements],
      'write',
    );

    if (pendingTagBump !== null) {
      // Best-effort; never fail the request on this.
      trackedExecute(
        { sql: 'UPDATE expense_tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', args: [pendingTagBump, userId] },
        'updateTagLastUsedAt',
      ).catch(() => {});
    }

    const expense = await loadExpenseById(userId, id);
    res.json(expenseRowToExpense(expense as ExpenseRow));
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
    const userId = getUserId(req);
    const ownership = await trackedExecute({
      sql: 'SELECT id FROM expenses WHERE id = ? AND user_id = ?',
      args: [req.params.id, userId],
    }, 'checkExpenseOwnershipForDelete');
    if (ownership.rows.length === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    // If this was a card purchase, give the balance back to the tranches it drew
    // from before removing the row (the FK cascade only deletes allocation rows).
    const reversal = await buildReversalStatements(Number(req.params.id));
    const statements = [...reversal, { sql: 'DELETE FROM expenses WHERE id = ? AND user_id = ?', args: [req.params.id, userId] }];
    const results = await db.batch(statements, 'write');

    const deleteResult = results[results.length - 1];
    if (deleteResult.rowsAffected === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
