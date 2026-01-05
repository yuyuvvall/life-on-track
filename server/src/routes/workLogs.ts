import { Router } from 'express';
import db, { getToday } from '../db/index.js';
import type { WorkLogRow } from '../types.js';
import { workLogRowToWorkLog } from '../types.js';

const router = Router();

// Get all work logs
router.get('/', async (_req, res) => {
  try {
    const result = await db.execute('SELECT * FROM work_logs ORDER BY log_date DESC');
    const logs = result.rows as unknown as WorkLogRow[];
    res.json(logs.map(workLogRowToWorkLog));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Get today's work log
router.get('/today', async (_req, res) => {
  try {
    const today = getToday();
    const result = await db.execute({
      sql: 'SELECT * FROM work_logs WHERE log_date = ?',
      args: [today]
    });
    
    const log = result.rows[0] as unknown as WorkLogRow | undefined;
    res.json(log ? workLogRowToWorkLog(log) : null);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Get work log by date
router.get('/date/:date', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM work_logs WHERE log_date = ?',
      args: [req.params.date]
    });
    
    const log = result.rows[0] as unknown as WorkLogRow | undefined;
    res.json(log ? workLogRowToWorkLog(log) : null);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Create or update work log
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
    const existingResult = await db.execute({
      sql: 'SELECT * FROM work_logs WHERE log_date = ?',
      args: [date]
    });
    const existing = existingResult.rows[0] as unknown as WorkLogRow | undefined;

    if (existing) {
      await db.execute({
        sql: `UPDATE work_logs 
              SET integrity_score = ?, missed_opportunity_note = ?, success_note = ?
              WHERE log_date = ?`,
        args: [integrityScore, missedOpportunityNote || null, successNote || null, date]
      });
    } else {
      await db.execute({
        sql: `INSERT INTO work_logs (log_date, integrity_score, missed_opportunity_note, success_note)
              VALUES (?, ?, ?, ?)`,
        args: [date, integrityScore, missedOpportunityNote || null, successNote || null]
      });
    }

    const logResult = await db.execute({
      sql: 'SELECT * FROM work_logs WHERE log_date = ?',
      args: [date]
    });
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

    const existingResult = await db.execute({
      sql: 'SELECT * FROM work_logs WHERE id = ?',
      args: [id]
    });
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
      await db.execute({
        sql: `UPDATE work_logs SET ${updates.join(', ')} WHERE id = ?`,
        args: values
      });
    }

    const logResult = await db.execute({
      sql: 'SELECT * FROM work_logs WHERE id = ?',
      args: [id]
    });
    const log = logResult.rows[0] as unknown as WorkLogRow;
    res.json(workLogRowToWorkLog(log));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
