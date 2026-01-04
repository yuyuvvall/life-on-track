import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { getWeekStart } from '../db/index.js';
import type { GoalRow, GoalLogRow, GoalStats } from '../types.js';
import { goalRowToGoal, goalLogRowToGoalLog } from '../types.js';

const router = Router();

// Get all goals (top-level only, not sub-goals)
router.get('/', (_req, res) => {
  // Get goals that are NOT children in any relation
  const goals = db.prepare(`
    SELECT g.* FROM goals g
    WHERE g.is_active = 1 
      AND NOT EXISTS (
        SELECT 1 FROM goal_relations gr WHERE gr.child_goal_id = g.id
      )
    ORDER BY g.created_at DESC
  `).all() as GoalRow[];
  res.json(goals.map(goalRowToGoal));
});

// Get single goal with stats
router.get('/:id', (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id) as GoalRow | undefined;
  
  if (!goal) {
    return res.status(404).json({ message: 'Goal not found' });
  }

  res.json(goalRowToGoal(goal));
});

// Get goal stats (velocity, projections, sub-goals, etc.)
router.get('/:id/stats', (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id) as GoalRow | undefined;
  
  if (!goal) {
    return res.status(404).json({ message: 'Goal not found' });
  }

  const logs = db.prepare(`
    SELECT * FROM goal_logs WHERE goal_id = ? ORDER BY log_date DESC LIMIT 30
  `).all(req.params.id) as GoalLogRow[];

  // Get sub-goals via junction table
  const subGoals = db.prepare(`
    SELECT g.* FROM goals g
    INNER JOIN goal_relations gr ON gr.child_goal_id = g.id
    WHERE gr.parent_goal_id = ? AND g.is_active = 1 
    ORDER BY g.created_at ASC
  `).all(req.params.id) as GoalRow[];

  const stats = calculateGoalStats(goal, logs, subGoals);
  res.json(stats);
});

// Get sub-goals for a parent goal (via junction table)
router.get('/:id/subgoals', (req, res) => {
  const subGoals = db.prepare(`
    SELECT g.* FROM goals g
    INNER JOIN goal_relations gr ON gr.child_goal_id = g.id
    WHERE gr.parent_goal_id = ? AND g.is_active = 1 
    ORDER BY g.created_at ASC
  `).all(req.params.id) as GoalRow[];
  
  res.json(subGoals.map(goalRowToGoal));
});

// Get goal logs
router.get('/:id/logs', (req, res) => {
  const { limit = '30' } = req.query;
  
  const logs = db.prepare(`
    SELECT * FROM goal_logs WHERE goal_id = ? ORDER BY log_date DESC LIMIT ?
  `).all(req.params.id, parseInt(limit as string)) as GoalLogRow[];

  res.json(logs.map(goalLogRowToGoalLog));
});

// Create goal (supports parentId for sub-goals via junction table)
router.post('/', (req, res) => {
  const { 
    title, 
    goalType = 'frequency', 
    targetValue, 
    unit,
    totalPages,
    frequencyPeriod,
    targetDate,
    parentId
  } = req.body;

  if (!title) {
    return res.status(400).json({ message: 'Title is required' });
  }

  // If creating a sub-goal, verify parent exists
  if (parentId) {
    const parent = db.prepare('SELECT * FROM goals WHERE id = ?').get(parentId) as GoalRow | undefined;
    if (!parent) {
      return res.status(404).json({ message: 'Parent goal not found' });
    }
  }

  const id = uuidv4();
  
  // Insert the goal (no parent_id column used anymore)
  db.prepare(`
    INSERT INTO goals (id, title, goal_type, target_value, unit, total_pages, frequency_period, target_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title, 
    goalType, 
    targetValue || 0, 
    unit || '', 
    goalType === 'reading' ? totalPages : null,
    goalType === 'frequency' ? (frequencyPeriod || 'weekly') : null,
    targetDate || null
  );

  // If this is a sub-goal, create the relation
  if (parentId) {
    db.prepare(`
      INSERT INTO goal_relations (parent_goal_id, child_goal_id, relation_type)
      VALUES (?, ?, 'subgoal')
    `).run(parentId, id);
  }

  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow;
  res.status(201).json(goalRowToGoal(goal));
});

// Update goal
router.patch('/:id', (req, res) => {
  const { id } = req.params;
  const { title, targetValue, unit, totalPages, currentPage, currentValue, targetDate, isActive } = req.body;

  const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined;
  if (!existing) {
    return res.status(404).json({ message: 'Goal not found' });
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) {
    updates.push('title = ?');
    values.push(title);
  }
  if (targetValue !== undefined) {
    updates.push('target_value = ?');
    values.push(targetValue);
  }
  if (unit !== undefined) {
    updates.push('unit = ?');
    values.push(unit);
  }
  if (totalPages !== undefined) {
    updates.push('total_pages = ?');
    values.push(totalPages);
  }
  if (currentPage !== undefined) {
    updates.push('current_page = ?');
    values.push(currentPage);
  }
  if (currentValue !== undefined) {
    updates.push('current_value = ?');
    values.push(currentValue);
  }
  if (targetDate !== undefined) {
    updates.push('target_date = ?');
    values.push(targetDate);
  }
  if (isActive !== undefined) {
    updates.push('is_active = ?');
    values.push(isActive ? 1 : 0);
  }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE goals SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow;
  res.json(goalRowToGoal(goal));
});

// Log progress for a goal
router.post('/:id/logs', (req, res) => {
  const { id } = req.params;
  const { value, note, logDate } = req.body;

  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined;
  if (!goal) {
    return res.status(404).json({ message: 'Goal not found' });
  }

  if (value === undefined || value === null) {
    return res.status(400).json({ message: 'Value is required' });
  }

  const date = logDate || new Date().toISOString().split('T')[0];

  // Upsert log - preserve existing note if no new note provided
  db.prepare(`
    INSERT INTO goal_logs (goal_id, log_date, value, note)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(goal_id, log_date) DO UPDATE SET 
      value = excluded.value,
      note = COALESCE(excluded.note, note)
  `).run(id, date, value, note || null);

  // Update goal's current value based on type
  if (goal.goal_type === 'reading') {
    // For reading, value is current page
    db.prepare('UPDATE goals SET current_page = ? WHERE id = ?').run(value, id);
  } else if (goal.goal_type === 'frequency') {
    // For frequency, only count value=1 logs (completed entries)
    const periodStart = goal.frequency_period === 'weekly' 
      ? getWeekStart() 
      : goal.frequency_period === 'monthly'
        ? new Date().toISOString().slice(0, 7) + '-01'
        : date;
    
    const periodLogs = db.prepare(`
      SELECT COUNT(*) as count FROM goal_logs 
      WHERE goal_id = ? AND log_date >= ? AND value = 1
    `).get(id, periodStart) as { count: number };
    
    db.prepare('UPDATE goals SET current_value = ? WHERE id = ?').run(periodLogs.count, id);
  } else {
    // For numeric, value is current total
    db.prepare('UPDATE goals SET current_value = ? WHERE id = ?').run(value, id);
  }

  const log = db.prepare(`
    SELECT * FROM goal_logs WHERE goal_id = ? AND log_date = ?
  `).get(id, date) as GoalLogRow;

  const updatedGoal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow;

  res.status(201).json({
    log: goalLogRowToGoalLog(log),
    goal: goalRowToGoal(updatedGoal),
  });
});

// Delete goal (soft delete)
router.delete('/:id', (req, res) => {
  const result = db.prepare('UPDATE goals SET is_active = 0 WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ message: 'Goal not found' });
  }

  res.status(204).send();
});

// Helper: Calculate goal statistics
function calculateGoalStats(goal: GoalRow, logs: GoalLogRow[], subGoalRows: GoalRow[]): GoalStats {
  const goalData = goalRowToGoal(goal);
  const logsData = logs.map(goalLogRowToGoalLog);
  const subGoals = subGoalRows.map(goalRowToGoal);

  let velocity: number | null = null;
  let estimatedFinishDate: string | null = null;
  let daysRemaining: number | null = null;
  let progressPercent = 0;
  let streak = 0;
  let periodProgress: { current: number; target: number } | null = null;

  // Calculate sub-goals completed (for numeric/composite goals)
  const subGoalsCompleted = subGoals.filter(sg => {
    if (sg.targetValue > 0) {
      return sg.currentValue >= sg.targetValue;
    }
    return false;
  }).length;

  if (goal.goal_type === 'reading' && goal.total_pages) {
    // Calculate reading velocity (pages per day)
    progressPercent = Math.round((goal.current_page / goal.total_pages) * 100);
    
    if (logs.length >= 2) {
      const sortedLogs = [...logs].sort((a, b) => 
        new Date(a.log_date).getTime() - new Date(b.log_date).getTime()
      );

      const firstLog = sortedLogs[0];
      const lastLog = sortedLogs[sortedLogs.length - 1];
      const daysDiff = 1 + Math.max(1, 
        (new Date(lastLog.log_date).getTime() - new Date(firstLog.log_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      const pagesDiff = lastLog.value
      
      velocity = Math.round((pagesDiff / daysDiff) * 10) / 10; // pages per day
      
      if (velocity > 0) {
        const pagesRemaining = goal.total_pages - goal.current_page;
        daysRemaining = Math.ceil(pagesRemaining / velocity);
        
        const finishDate = new Date();
        finishDate.setDate(finishDate.getDate() + daysRemaining);
        estimatedFinishDate = finishDate.toISOString().split('T')[0];
      }
    }
  } else if (goal.goal_type === 'frequency') {
    // Calculate period progress - only count value=1 (completed) logs
    const periodStart = goal.frequency_period === 'weekly' 
      ? getWeekStart() 
      : goal.frequency_period === 'monthly'
        ? new Date().toISOString().slice(0, 7) + '-01'
        : new Date().toISOString().split('T')[0];
    
    const periodLogs = logs.filter(l => l.log_date >= periodStart && l.value === 1);
    periodProgress = {
      current: periodLogs.length,
      target: goal.target_value,
    };
    progressPercent = goal.target_value > 0 
      ? Math.round((periodLogs.length / goal.target_value) * 100)
      : 0;
  } else if (goal.goal_type === 'numeric') {
    // For numeric goals with sub-goals, progress is based on completed sub-goals
    if (subGoals.length > 0) {
      progressPercent = Math.round((subGoalsCompleted / subGoals.length) * 100);
    } else {
      progressPercent = goal.target_value > 0
        ? Math.round((goal.current_value / goal.target_value) * 100)
        : 0;
    }
  }

  // Calculate streak (consecutive days with logs)
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const dateStr = checkDate.toISOString().split('T')[0];
    
    if (logs.some(l => l.log_date === dateStr)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  return {
    goal: goalData,
    logs: logsData,
    subGoals,
    subGoalsCompleted,
    velocity,
    estimatedFinishDate,
    daysRemaining,
    progressPercent: Math.min(progressPercent, 100),
    streak,
    periodProgress,
  };
}

export default router;
