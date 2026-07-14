import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { trackedExecute, resolveCategoryId } from '../db/index.js';
import type { ExpenseRow, TaskRow } from '../types.js';
import { expenseRowToExpense, taskRowToTask } from '../types.js';
import { EXPENSE_COLUMNS } from './expenses.js';
import { parseVoiceCommand, type VoiceIntent } from '../services/voiceParser.js';

const router = Router();

const MAX_TEXT_LENGTH = 500;

async function logVoiceCommand(
  userId: string | null,
  text: string,
  parsed: VoiceIntent | null,
  status: 'created' | 'unclear' | 'error',
  entityKind: string | null,
  entityId: string | null,
  error: string | null,
) {
  // Best-effort audit trail; never fail the request on it.
  trackedExecute({
    sql: `INSERT INTO voice_commands (user_id, text, parsed, status, entity_kind, entity_id, error)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [userId, text, parsed ? JSON.stringify(parsed) : null, status, entityKind, entityId, error],
  }, 'logVoiceCommand').catch(() => {});
}

/**
 * @swagger
 * /voice/command:
 *   post:
 *     summary: Create a task or expense from free-form voice-transcribed text
 *     tags: [Voice]
 *     parameters:
 *       - in: header
 *         name: X-Api-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: Must match the server's VOICE_API_KEY
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [text]
 *             properties:
 *               text:
 *                 type: string
 *                 example: add a food expense for 65 shekels
 *     responses:
 *       201:
 *         description: Task or expense created
 *       200:
 *         description: Command understood as neither task nor expense
 *       400:
 *         description: Missing or invalid text
 *       401:
 *         description: Missing or wrong X-Api-Key
 *       503:
 *         description: Voice commands not configured on the server (VOICE_API_KEY or VOICE_USER_ID missing)
 */
router.post('/command', async (req, res) => {
  const expectedKey = process.env.VOICE_API_KEY;
  if (!expectedKey) {
    return res.status(503).json({ message: 'Voice commands are not configured (VOICE_API_KEY is missing)' });
  }
  if (req.header('X-Api-Key') !== expectedKey) {
    return res.status(401).json({ message: 'Invalid API key' });
  }
  const voiceUserId = process.env.VOICE_USER_ID;
  if (!voiceUserId) {
    return res.status(503).json({ message: 'Voice commands are not configured (VOICE_USER_ID is missing)' });
  }

  const { text } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ message: 'Text is required' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ message: `Text must be at most ${MAX_TEXT_LENGTH} characters` });
  }
  const command = text.trim();

  let intent: VoiceIntent;
  try {
    const categoriesResult = await trackedExecute(
      {
        sql: 'SELECT name FROM categories WHERE is_archived = 0 AND user_id = ? ORDER BY sort_order',
        args: [voiceUserId],
      },
      'getCategoriesForVoice',
    );
    const knownCategories = categoriesResult.rows.map((r) => String(r.name));
    intent = await parseVoiceCommand(command, knownCategories);
  } catch (err) {
    const message = (err as Error).message;
    await logVoiceCommand(voiceUserId, command, null, 'error', null, null, message);
    return res.status(502).json({ message: `Could not parse the command: ${message}` });
  }

  try {
    switch (intent.kind) {
      case 'task': {
        const id = uuidv4();
        await trackedExecute({
          sql: `INSERT INTO tasks (id, parent_id, title, category, deadline, user_id)
                VALUES (?, NULL, ?, ?, ?, ?)`,
          args: [id, intent.title, intent.category, intent.deadline, voiceUserId],
        }, 'createTaskFromVoice');

        const taskResult = await trackedExecute(
          { sql: 'SELECT * FROM tasks WHERE id = ?', args: [id] },
          'getVoiceCreatedTask',
        );
        const task = taskRowToTask(taskResult.rows[0] as unknown as TaskRow, []);

        await logVoiceCommand(voiceUserId, command, intent, 'created', 'task', id, null);
        const deadlinePart = intent.deadline ? `, due ${intent.deadline.slice(0, 10)}` : '';
        return res.status(201).json({
          status: 'ok',
          kind: 'task',
          confirmation: `Added ${intent.category} task: ${intent.title}${deadlinePart}`,
          entity: task,
        });
      }
      case 'expense': {
        const categoryId = await resolveCategoryId(voiceUserId, intent.category);
        const result = await trackedExecute({
          sql: `INSERT INTO expenses (amount, category_id, note, created_at, tag_id, card_id, face_amount, user_id)
                VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)`,
          args: [intent.amount, categoryId, intent.note, new Date().toISOString(), voiceUserId],
        }, 'createExpenseFromVoice');

        const expenseId = Number(result.lastInsertRowid);
        const expenseResult = await trackedExecute({
          sql: `SELECT ${EXPENSE_COLUMNS}
                FROM expenses LEFT JOIN categories c ON c.id = expenses.category_id
                WHERE expenses.id = ?`,
          args: [expenseId],
        }, 'getVoiceCreatedExpense');
        const expense = expenseRowToExpense(expenseResult.rows[0] as unknown as ExpenseRow);

        await logVoiceCommand(voiceUserId, command, intent, 'created', 'expense', String(expenseId), null);
        return res.status(201).json({
          status: 'ok',
          kind: 'expense',
          confirmation: `Added ₪${intent.amount} ${expense.category} expense`,
          entity: expense,
        });
      }
      default: {
        await logVoiceCommand(voiceUserId, command, intent, 'unclear', null, null, null);
        return res.status(200).json({
          status: 'unclear',
          confirmation: intent.reason,
        });
      }
    }
  } catch (err) {
    const message = (err as Error).message;
    await logVoiceCommand(voiceUserId, command, intent, 'error', null, null, message);
    return res.status(500).json({ message });
  }
});

export default router;
