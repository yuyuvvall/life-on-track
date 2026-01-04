import { Router } from 'express';
import db, { getToday } from '../db/index.js';
import type { WorkLogRow } from '../types.js';
import { workLogRowToWorkLog } from '../types.js';

const router = Router();

// Get all work logs
router.get('/', (_req, res) => {
  const logs = db.prepare(`
    SELECT * FROM work_logs ORDER BY log_date DESC
  `).all() as WorkLogRow[];

  res.json(logs.map(workLogRowToWorkLog));
});

// Get today's work log
router.get('/today', (_req, res) => {
  const today = getToday();
  const log = db.prepare('SELECT * FROM work_logs WHERE log_date = ?').get(today) as WorkLogRow | undefined;
  
  res.json(log ? workLogRowToWorkLog(log) : null);
});

// Get work log by date
router.get('/date/:date', (req, res) => {
  const log = db.prepare('SELECT * FROM work_logs WHERE log_date = ?')
    .get(req.params.date) as WorkLogRow | undefined;
  
  res.json(log ? workLogRowToWorkLog(log) : null);
});

// Create or update work log
router.post('/', (req, res) => {
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
  const existing = db.prepare('SELECT * FROM work_logs WHERE log_date = ?').get(date) as WorkLogRow | undefined;

  if (existing) {
    db.prepare(`
      UPDATE work_logs 
      SET integrity_score = ?, missed_opportunity_note = ?, success_note = ?
      WHERE log_date = ?
    `).run(integrityScore, missedOpportunityNote || null, successNote || null, date);
  } else {
    db.prepare(`
      INSERT INTO work_logs (log_date, integrity_score, missed_opportunity_note, success_note)
      VALUES (?, ?, ?, ?)
    `).run(date, integrityScore, missedOpportunityNote || null, successNote || null);
  }

  const log = db.prepare('SELECT * FROM work_logs WHERE log_date = ?').get(date) as WorkLogRow;
  res.status(existing ? 200 : 201).json(workLogRowToWorkLog(log));
});

// Update work log
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { integrityScore, missedOpportunityNote, successNote } = req.body;

  const existing = db.prepare('SELECT * FROM work_logs WHERE id = ?').get(id) as WorkLogRow | undefined;
  if (!existing) {
    return res.status(404).json({ message: 'Work log not found' });
  }

  // If updating score to 0, require note
  const newScore = integrityScore ?? existing.integrity_score;
  const newNote = missedOpportunityNote ?? existing.missed_opportunity_note;
  
  if (newScore === 0 && !newNote) {
    return res.status(400).json({ 
      message: 'Missed opportunity note is required when integrity score is 0' 
    });
  }

  const updates: string[] = [];
  const values: unknown[] = [];

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
    values.push(id);
    db.prepare(`UPDATE work_logs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const log = db.prepare('SELECT * FROM work_logs WHERE id = ?').get(id) as WorkLogRow;
  res.json(workLogRowToWorkLog(log));
});

export default router;

