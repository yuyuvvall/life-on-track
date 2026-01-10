import { Router } from 'express';
import { getToday, trackedExecute } from '../db/index.js';
import type { WorkLogRow } from '../types.js';
import { workLogRowToWorkLog } from '../types.js';

const router = Router();

/**
 * @swagger
 * /work-logs:
 *   get:
 *     summary: Get all work logs
 *     tags: [Work Logs]
 *     responses:
 *       200:
 *         description: List of work logs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WorkLog'
 */
router.get('/', async (_req, res) => {
  try {
    const result = await trackedExecute('SELECT * FROM work_logs ORDER BY log_date DESC', 'getAllWorkLogs');
    const logs = result.rows as unknown as WorkLogRow[];
    res.json(logs.map(workLogRowToWorkLog));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /work-logs/today:
 *   get:
 *     summary: Get today's work log
 *     tags: [Work Logs]
 *     responses:
 *       200:
 *         description: Today's work log or null
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/WorkLog'
 *                 - type: 'null'
 */
router.get('/today', async (_req, res) => {
  try {
    const today = getToday();
    const result = await trackedExecute({
      sql: 'SELECT * FROM work_logs WHERE log_date = ?',
      args: [today]
    }, 'getTodayWorkLog');
    
    const log = result.rows[0] as unknown as WorkLogRow | undefined;
    res.json(log ? workLogRowToWorkLog(log) : null);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Get work log by date
router.get('/date/:date', async (req, res) => {
  try {
    const result = await trackedExecute({
      sql: 'SELECT * FROM work_logs WHERE log_date = ?',
      args: [req.params.date]
    }, 'getWorkLogByDate');
    
    const log = result.rows[0] as unknown as WorkLogRow | undefined;
    res.json(log ? workLogRowToWorkLog(log) : null);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /work-logs:
 *   post:
 *     summary: Create or update work log
 *     tags: [Work Logs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateWorkLogRequest'
 *     responses:
 *       201:
 *         description: Work log created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WorkLog'
 *       200:
 *         description: Work log updated
 *       400:
 *         description: Integrity score must be 0 or 1. Missed opportunity note required if 0.
 */
router.post('/', async (req, res) => {
  try {
    const { logDate, integrityScore, missedOpportunityNote, successNote } = req.body;
    const date = logDate || getToday();

    // Validate integrity score
    if (integrityScore !== 0 && integrityScore !== 1) {
      return res.status(400).json({ message: 'Integrity score must be 0 or 1' });
    }

    // If score is 0, require missed opportunity note
    if (integrityScore === 0 && !missedOpportunityNote) {
      return res.status(400).json({ 
        message: 'Missed opportunity note is required when integrity score is 0' 
      });
    }

    // Check if log exists for this date
    const existingResult = await trackedExecute({
      sql: 'SELECT * FROM work_logs WHERE log_date = ?',
      args: [date]
    }, 'checkWorkLogExists');
    const existing = existingResult.rows[0] as unknown as WorkLogRow | undefined;

    if (existing) {
      await trackedExecute({
        sql: `UPDATE work_logs 
              SET integrity_score = ?, missed_opportunity_note = ?, success_note = ?
              WHERE log_date = ?`,
        args: [integrityScore, missedOpportunityNote || null, successNote || null, date]
      }, 'updateWorkLog');
    } else {
      await trackedExecute({
        sql: `INSERT INTO work_logs (log_date, integrity_score, missed_opportunity_note, success_note)
              VALUES (?, ?, ?, ?)`,
        args: [date, integrityScore, missedOpportunityNote || null, successNote || null]
      }, 'createWorkLog');
    }

    const logResult = await trackedExecute({
      sql: 'SELECT * FROM work_logs WHERE log_date = ?',
      args: [date]
    }, 'getCreatedWorkLog');
    const log = logResult.rows[0] as unknown as WorkLogRow;
    res.status(existing ? 200 : 201).json(workLogRowToWorkLog(log));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Update work log
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { integrityScore, missedOpportunityNote, successNote } = req.body;

    const existingResult = await trackedExecute({
      sql: 'SELECT * FROM work_logs WHERE id = ?',
      args: [id]
    }, 'checkWorkLogExistsForUpdate');
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Work log not found' });
    }
    const existing = existingResult.rows[0] as unknown as WorkLogRow;

    // If updating score to 0, require note
    const newScore = integrityScore ?? existing.integrity_score;
    const newNote = missedOpportunityNote ?? existing.missed_opportunity_note;
    
    if (newScore === 0 && !newNote) {
      return res.status(400).json({ 
        message: 'Missed opportunity note is required when integrity score is 0' 
      });
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (integrityScore !== undefined) {
      updates.push('integrity_score = ?');
      values.push(integrityScore);
    }
    if (missedOpportunityNote !== undefined) {
      updates.push('missed_opportunity_note = ?');
      values.push(missedOpportunityNote);
    }
    if (successNote !== undefined) {
      updates.push('success_note = ?');
      values.push(successNote);
    }

    if (updates.length > 0) {
      values.push(parseInt(id));
      await trackedExecute({
        sql: `UPDATE work_logs SET ${updates.join(', ')} WHERE id = ?`,
        args: values
      }, 'patchWorkLog');
    }

    const logResult = await trackedExecute({
      sql: 'SELECT * FROM work_logs WHERE id = ?',
      args: [id]
    }, 'getUpdatedWorkLog');
    const log = logResult.rows[0] as unknown as WorkLogRow;
    res.json(workLogRowToWorkLog(log));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
