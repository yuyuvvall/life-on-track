import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { getWeekStart } from '../db/index.js';
import type { GoalRow, GoalLogRow, GoalStats } from '../types.js';
import { goalRowToGoal, goalLogRowToGoalLog } from '../types.js';

const router = Router();

// Get all goals (top-level only, not sub-goals)
router.get('/', async (_req, res) => {
  try {
    const result = await db.execute(`
      SELECT g.* FROM goals g
      WHERE g.is_active = 1 
        AND NOT EXISTS (
          SELECT 1 FROM goal_relations gr WHERE gr.child_goal_id = g.id
        )
      ORDER BY g.created_at DESC
    `);
    const goals = result.rows as unknown as GoalRow[];
    res.json(goals.map(goalRowToGoal));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Get single goal with stats
router.get('/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [req.params.id]
    });
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    const goal = result.rows[0] as unknown as GoalRow;
    res.json(goalRowToGoal(goal));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Get goal stats (velocity, projections, sub-goals, etc.)
router.get('/:id/stats', async (req, res) => {
  try {
    const goalResult = await db.execute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [req.params.id]
    });
    
    if (goalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    const goal = goalResult.rows[0] as unknown as GoalRow;

    const logsResult = await db.execute({
      sql: 'SELECT * FROM goal_logs WHERE goal_id = ? ORDER BY log_date DESC LIMIT 30',
      args: [req.params.id]
    });
    const logs = logsResult.rows as unknown as GoalLogRow[];

    // Get sub-goals via junction table
    const subGoalsResult = await db.execute({
      sql: `SELECT g.* FROM goals g
            INNER JOIN goal_relations gr ON gr.child_goal_id = g.id
            WHERE gr.parent_goal_id = ? AND g.is_active = 1 
            ORDER BY g.created_at ASC`,
      args: [req.params.id]
    });
    const subGoals = subGoalsResult.rows as unknown as GoalRow[];

    const stats = calculateGoalStats(goal, logs, subGoals);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Get sub-goals for a parent goal (via junction table)
router.get('/:id/subgoals', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT g.* FROM goals g
            INNER JOIN goal_relations gr ON gr.child_goal_id = g.id
            WHERE gr.parent_goal_id = ? AND g.is_active = 1 
            ORDER BY g.created_at ASC`,
      args: [req.params.id]
    });
    const subGoals = result.rows as unknown as GoalRow[];
    res.json(subGoals.map(goalRowToGoal));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Get goal logs
router.get('/:id/logs', async (req, res) => {
  try {
    const { limit = '30' } = req.query;
    const result = await db.execute({
      sql: 'SELECT * FROM goal_logs WHERE goal_id = ? ORDER BY log_date DESC LIMIT ?',
      args: [req.params.id, parseInt(limit as string)]
    });
    const logs = result.rows as unknown as GoalLogRow[];
    res.json(logs.map(goalLogRowToGoalLog));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Create goal (supports parentId for sub-goals via junction table)
router.post('/', async (req, res) => {
  try {
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
      const parentResult = await db.execute({
        sql: 'SELECT * FROM goals WHERE id = ?',
        args: [parentId]
      });
      if (parentResult.rows.length === 0) {
        return res.status(404).json({ message: 'Parent goal not found' });
      }
    }

    const id = uuidv4();
    
    // Insert the goal
    await db.execute({
      sql: `INSERT INTO goals (id, title, goal_type, target_value, unit, total_pages, frequency_period, target_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        title, 
        goalType, 
        targetValue || 0, 
        unit || '', 
        goalType === 'reading' ? totalPages : null,
        goalType === 'frequency' ? (frequencyPeriod || 'weekly') : null,
        targetDate || null
      ]
    });

    // If this is a sub-goal, create the relation
    if (parentId) {
      await db.execute({
        sql: `INSERT INTO goal_relations (parent_goal_id, child_goal_id, relation_type)
              VALUES (?, ?, 'subgoal')`,
        args: [parentId, id]
      });
    }

    const goalResult = await db.execute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [id]
    });
    const goal = goalResult.rows[0] as unknown as GoalRow;
    res.status(201).json(goalRowToGoal(goal));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Update goal
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, targetValue, unit, totalPages, currentPage, currentValue, targetDate, isActive } = req.body;

    const existingResult = await db.execute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [id]
    });
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

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
      await db.execute({
        sql: `UPDATE goals SET ${updates.join(', ')} WHERE id = ?`,
        args: values
      });
    }

    const goalResult = await db.execute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [id]
    });
    const goal = goalResult.rows[0] as unknown as GoalRow;
    res.json(goalRowToGoal(goal));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Log progress for a goal
router.post('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { value, note, logDate } = req.body;

    const goalResult = await db.execute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [id]
    });
    if (goalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    const goal = goalResult.rows[0] as unknown as GoalRow;

    if (value === undefined || value === null) {
      return res.status(400).json({ message: 'Value is required' });
    }

    const date = logDate || new Date().toISOString().split('T')[0];

    // Upsert log - preserve existing note if no new note provided
    await db.execute({
      sql: `INSERT INTO goal_logs (goal_id, log_date, value, note)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(goal_id, log_date) DO UPDATE SET 
              value = excluded.value,
              note = COALESCE(excluded.note, note)`,
      args: [id, date, value, note || null]
    });

    // Update goal's current value based on type
    if (goal.goal_type === 'reading') {
      await db.execute({
        sql: 'UPDATE goals SET current_page = ? WHERE id = ?',
        args: [value, id]
      });
    } else if (goal.goal_type === 'frequency') {
      const periodStart = goal.frequency_period === 'weekly' 
        ? getWeekStart() 
        : goal.frequency_period === 'monthly'
          ? new Date().toISOString().slice(0, 7) + '-01'
          : date;
      
      const countResult = await db.execute({
        sql: `SELECT COUNT(*) as count FROM goal_logs 
              WHERE goal_id = ? AND log_date >= ? AND value = 1`,
        args: [id, periodStart]
      });
      const count = (countResult.rows[0] as unknown as { count: number }).count;
      
      await db.execute({
        sql: 'UPDATE goals SET current_value = ? WHERE id = ?',
        args: [count, id]
      });
    } else {
      await db.execute({
        sql: 'UPDATE goals SET current_value = ? WHERE id = ?',
        args: [value, id]
      });
    }

    const logResult = await db.execute({
      sql: 'SELECT * FROM goal_logs WHERE goal_id = ? AND log_date = ?',
      args: [id, date]
    });
    const log = logResult.rows[0] as unknown as GoalLogRow;

    const updatedGoalResult = await db.execute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [id]
    });
    const updatedGoal = updatedGoalResult.rows[0] as unknown as GoalRow;

    res.status(201).json({
      log: goalLogRowToGoalLog(log),
      goal: goalRowToGoal(updatedGoal),
    });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Delete goal (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'UPDATE goals SET is_active = 0 WHERE id = ?',
      args: [req.params.id]
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
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

  const subGoalsCompleted = subGoals.filter(sg => {
    if (sg.targetValue > 0) {
      return sg.currentValue >= sg.targetValue;
    }
    return false;
  }).length;

  if (goal.goal_type === 'reading' && goal.total_pages) {
    progressPercent = Math.round((goal.current_page / goal.total_pages) * 100);
    
    if (logs.length >= 2) {
      const sortedLogs = [...logs].sort((a, b) => 
        new Date(a.log_date).getTime() - new Date(b.log_date).getTime()
      );

      const firstLog = sortedLogs[0];
      const lastLog = sortedLogs[sortedLogs.length - 1];
      const daysDiff = Math.max(1, 
        (new Date(lastLog.log_date).getTime() - new Date(firstLog.log_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      const pagesDiff = lastLog.value - firstLog.value;
      
      velocity = Math.round((pagesDiff / daysDiff) * 10) / 10;
      
      if (velocity > 0) {
        const pagesRemaining = goal.total_pages - goal.current_page;
        daysRemaining = Math.ceil(pagesRemaining / velocity);
        
        const finishDate = new Date();
        finishDate.setDate(finishDate.getDate() + daysRemaining);
        estimatedFinishDate = finishDate.toISOString().split('T')[0];
      }
    }
  } else if (goal.goal_type === 'frequency') {
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
    if (subGoals.length > 0) {
      progressPercent = Math.round((subGoalsCompleted / subGoals.length) * 100);
    } else {
      progressPercent = goal.target_value > 0
        ? Math.round((goal.current_value / goal.target_value) * 100)
        : 0;
    }
  }

  // Calculate streak
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
