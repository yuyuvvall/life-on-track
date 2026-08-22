import { Router } from 'express';
import type { Response } from 'express';
import type { InValue } from '@libsql/client';
import db, { trackedExecute, resolveCategoryId, withWriteLock } from '../db/index.js';
import { getUserId } from '../middleware/auth.js';
import { HttpError, sendError as sendHttpError } from '../errors.js';
import type { ExpenseRow, ExpenseRepaymentRow, PrepaidCardRow } from '../types.js';
import { expenseRowToExpense, repaymentRowToRepayment } from '../types.js';
import type { Allocation, LedgerStatement } from '../services/cardLedger.js';
import {
  planAllocationFromTranches,
  applyAllocationStatements,
  reverseStatements,
  buildReversalStatements,
  isCardOverdraw,
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

/**
 * The shared `sendError`, plus the one mapping only this router needs: a batch
 * aborted by the drawdown guard means another writer took the face value first,
 * which is a conflict for the client to retry, not a server fault. (It lives here
 * rather than in errors.ts so that module stays free of ledger knowledge.)
 */
function sendError(res: Response, err: unknown) {
  if (isCardOverdraw(err)) {
    return sendHttpError(res, new HttpError(409, 'The card balance changed while saving. Refresh and try again.'));
  }
  return sendHttpError(res, err);
}

/**
 * `expenses.amount` is a REAL NOT NULL column that every report SUMs, and SQLite
 * will happily store a string in it and then treat that row as 0 — so a bad
 * amount doesn't fail loudly, it quietly deletes money from your totals. Every
 * write path funnels through here.
 */
function requireAmount(value: unknown, label = 'Amount'): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new HttpError(400, `${label} must be a positive number`);
  }
  return value;
}

/** Validate that a card exists and belongs to the user. Returns the row or null. */
async function loadCard(userId: string, cardId: number): Promise<PrepaidCardRow | null> {
  const result = await trackedExecute(
    { sql: 'SELECT * FROM prepaid_cards WHERE id = ? AND user_id = ?', args: [cardId, userId] },
    'validateCardOnExpense',
  );
  return (result.rows[0] as unknown as PrepaidCardRow | undefined) ?? null;
}

/**
 * As `loadCard`, but also rejects an archived card. Use it wherever a card is
 * being *newly assigned*; re-saving the card an expense already sits on must
 * keep working after the user archives it, or archiving a spent-out card would
 * lock every historical purchase on it out of editing.
 */
async function loadActiveCard(userId: string, cardId: number): Promise<PrepaidCardRow | null> {
  const row = await loadCard(userId, cardId);
  return row && row.is_archived !== 1 ? row : null;
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
    sendError(res, err);
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
    sendError(res, err);
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
    sendError(res, err);
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
    sendError(res, err);
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
    sendError(res, err);
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

    const parsedAmount = requireAmount(amount);

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

    let resolvedCardId: number | null = null;
    if (cardId !== undefined && cardId !== null) {
      if (!Number.isInteger(cardId)) {
        return res.status(400).json({ message: 'cardId must be an integer' });
      }
      const card = await loadActiveCard(userId, cardId);
      if (!card) {
        return res.status(400).json({ message: 'Invalid or archived cardId' });
      }
      resolvedCardId = cardId;
    }

    // Use provided date or default to now
    const timestamp = createdAt || new Date().toISOString();

    // Under the write lock the FIFO plan cannot go stale between being read and
    // being written, and the category is only invented once every guard has
    // passed — a rejected create used to leave one behind in the picker.
    const expense = await withWriteLock(userId, async () => {
      // When paid from a prepaid card, the incoming `amount` is the price tag
      // (face value). We draw it down the card's tranches (FIFO) and store the
      // discounted real cost as `amount`, keeping the price tag in `face_amount`.
      let storedAmount = parsedAmount;
      let faceAmount: number | null = null;
      let allocations: Allocation[] = [];
      if (resolvedCardId !== null) {
        const plan = planAllocationFromTranches(await getTranches(resolvedCardId), parsedAmount);
        if (!plan.ok) {
          throw new HttpError(400, `Amount exceeds card balance by ${round2(parsedAmount - plan.balance)}`);
        }
        faceAmount = parsedAmount;
        storedAmount = plan.realCost;
        allocations = plan.allocations;
      }

      const categoryId = await resolveCategoryId(userId, category);

      const result = await trackedExecute({
        sql: 'INSERT INTO expenses (amount, category_id, note, created_at, tag_id, card_id, face_amount, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [storedAmount, categoryId, note || null, timestamp, resolvedTagId, resolvedCardId, faceAmount, userId],
      }, 'createExpense');

      const newId = Number(result.lastInsertRowid);

      // Draw down the card tranches and record which load(s) this purchase consumed.
      // The row and its drawdown are two writes, so if the drawdown is refused —
      // the plan went stale under a writer outside this process — take the row
      // back out. Otherwise the user sees a failed save that nonetheless left a
      // card purchase behind, drawn from nothing.
      if (allocations.length > 0) {
        try {
          await db.batch(applyAllocationStatements(newId, allocations), 'write');
        } catch (err) {
          await trackedExecute(
            { sql: 'DELETE FROM expenses WHERE id = ? AND user_id = ?', args: [newId, userId] },
            'rollBackUnallocatedExpense',
          ).catch(() => {});
          throw err;
        }
      }

      // Read back inside the lock so the response reflects this write, not a later one.
      return await loadExpenseById(userId, newId);
    });

    if (resolvedTagId !== null) {
      // Best-effort; never fail the request on this.
      trackedExecute(
        { sql: 'UPDATE expense_tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', args: [resolvedTagId, userId] },
        'updateTagLastUsedAt',
      ).catch(() => {});
    }

    res.status(201).json(expenseRowToExpense(expense as ExpenseRow));
  } catch (err) {
    sendError(res, err);
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

    // ── Body-shape validation: the only thing that can be judged without the row ─
    if (amount !== undefined) requireAmount(amount);

    let pendingTagBump: number | null = null;
    if (tagId !== undefined && tagId !== null) {
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

    if (cardId !== undefined && cardId !== null && !Number.isInteger(cardId)) {
      return res.status(400).json({ message: 'cardId must be an integer or null' });
    }

    // ── Everything that reads the expense runs under the lock ──────────────────
    // `existing` decides which branch this edit takes, what face value is
    // re-allocated, and whether `samePurchase` short-circuits. Read before the
    // lock it can be stale by the time the branch runs — an overlapping save
    // would leave the row claiming a face value its allocations no longer match.
    // Guards here throw `HttpError`; a `return` would only exit the callback.
    const expense = await withWriteLock(userId, async () => {
      const existing = await loadExpenseById(userId, id);
      if (!existing) {
        throw new HttpError(404, 'Expense not found');
      }

      const updates: string[] = [];
      const args: InValue[] = [];
      const ledgerStatements: LedgerStatement[] = [];

      // The category is deliberately resolved last (see below), because resolving
      // it can create one and nothing after that point may reject the edit.
      if (note !== undefined) {
        updates.push('note = ?');
        args.push(note);
      }
      if (createdAt !== undefined) {
        updates.push('created_at = ?');
        args.push(createdAt);
      }
      if (tagId !== undefined) {
        updates.push('tag_id = ?');
        args.push(tagId);
      }

      // ── Card / amount handling ──────────────────────────────────────────────
      const cardInBody = cardId !== undefined;
      const effectiveCardId: number | null = cardInBody ? (cardId === null ? null : cardId) : existing.card_id;
      const amountInBody = amount !== undefined;
      const wasCard = existing.card_id != null;
      const willBeCard = effectiveCardId != null;
      const cardChanged = cardInBody && (cardId ?? null) !== (existing.card_id ?? null);
      const needsRealloc = (willBeCard && (amountInBody || cardChanged)) || (wasCard && !willBeCard);

      if (willBeCard) {
        // Only a card being newly assigned has to be active — see `loadActiveCard`.
        const card = cardChanged
          ? await loadActiveCard(userId, effectiveCardId as number)
          : await loadCard(userId, effectiveCardId as number);
        if (!card) {
          throw new HttpError(400, 'Invalid or archived cardId');
        }
      }

      // The amount that will end up stored after this edit (real money), for the
      // repaid-total guard below. Only known per-branch: a card re-allocation
      // stores plan.realCost, not the face value the client sent.
      let finalStoredAmount: number | undefined;

      if (needsRealloc) {
        const origAllocs = await getAllocations(numericId);

        if (willBeCard) {
          // The face value to (re)allocate: the new price tag if given, otherwise
          // keep the existing one (or, for a direct→card switch, the old amount).
          const newFace = requireAmount(
            amountInBody ? amount : (existing.face_amount ?? existing.amount),
            'A card purchase amount',
          );

          // Same card, same price tag — the purchase itself didn't change, so keep
          // the allocations it already holds. Re-running FIFO here would re-price a
          // purchase the user never touched (a cheaper tranche may have been freed
          // since), silently rewriting `amount` and potentially tripping the repaid
          // guard below on an edit that only renamed a category.
          const samePurchase =
            existing.card_id === effectiveCardId &&
            existing.face_amount != null &&
            Math.abs(newFace - existing.face_amount) < EPS;

          if (samePurchase) {
            updates.push('amount = ?'); args.push(existing.amount);
            updates.push('face_amount = ?'); args.push(existing.face_amount);
            updates.push('card_id = ?'); args.push(effectiveCardId);
            finalStoredAmount = existing.amount;
          } else {
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
              throw new HttpError(400, `Amount exceeds card balance by ${round2(newFace - plan.balance)}`);
            }

            ledgerStatements.push(...reverseStatements(numericId, origAllocs));
            ledgerStatements.push(...applyAllocationStatements(numericId, plan.allocations));
            updates.push('amount = ?'); args.push(plan.realCost);
            updates.push('face_amount = ?'); args.push(newFace);
            updates.push('card_id = ?'); args.push(effectiveCardId);
            finalStoredAmount = plan.realCost;
          }
        } else {
          // Card → direct: give back the balance and clear the card fields. The
          // price tag becomes the plain amount unless a new amount was supplied.
          ledgerStatements.push(...reverseStatements(numericId, origAllocs));
          const newAmount = requireAmount(amountInBody ? amount : (existing.face_amount ?? existing.amount));
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
      if (finalStoredAmount !== undefined && repaidTotal > 0 && finalStoredAmount < repaidTotal - EPS) {
        throw new HttpError(
          400,
          `New amount is below the ${round2(repaidTotal)} already repaid. Delete repayments first.`,
        );
      }

      // Only now, with every rejection behind us, is it safe to invent a category.
      if (category !== undefined) {
        updates.push('category_id = ?');
        args.push(await resolveCategoryId(userId, category));
      }

      if (updates.length === 0) {
        throw new HttpError(400, 'No fields to update');
      }

      args.push(id, userId);
      const results = await db.batch(
        [
          { sql: `UPDATE expenses SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, args },
          ...ledgerStatements,
        ],
        'write',
      );
      if (results[0].rowsAffected === 0) {
        // Deleted between the read and the write — impossible while we hold the
        // lock, but the batch is the only thing that can say so authoritatively.
        throw new HttpError(404, 'Expense not found');
      }

      // Read back inside the lock, so the response describes what this request
      // wrote rather than whatever the next writer has since done.
      return await loadExpenseById(userId, id);
    });

    if (pendingTagBump !== null) {
      // Best-effort; never fail the request on this.
      trackedExecute(
        { sql: 'UPDATE expense_tags SET last_used_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', args: [pendingTagBump, userId] },
        'updateTagLastUsedAt',
      ).catch(() => {});
    }

    res.json(expenseRowToExpense(expense as ExpenseRow));
  } catch (err) {
    sendError(res, err);
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

    // Read the allocations under the write lock. Without it two overlapping
    // deletes of the same expense each restore the same face value, inflating the
    // card's balance out of nothing.
    const deleted = await withWriteLock(userId, async () => {
      const ownership = await trackedExecute({
        sql: 'SELECT id FROM expenses WHERE id = ? AND user_id = ?',
        args: [req.params.id, userId],
      }, 'checkExpenseOwnershipForDelete');
      if (ownership.rows.length === 0) return false;

      // If this was a card purchase, give the balance back to the tranches it drew
      // from before removing the row (the FK cascade only deletes allocation rows).
      const reversal = await buildReversalStatements(Number(req.params.id));
      const results = await db.batch(
        [...reversal, { sql: 'DELETE FROM expenses WHERE id = ? AND user_id = ?', args: [req.params.id, userId] }],
        'write',
      );
      return results[results.length - 1].rowsAffected > 0;
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    res.status(204).send();
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
