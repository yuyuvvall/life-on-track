import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db, { getPeriodStart, trackedExecute } from '../db/index.js';
import { getUserId } from '../middleware/auth.js';
import type { GoalRow, GoalLogRow, GoalStats } from '../types.js';
import { goalRowToGoal, goalLogRowToGoalLog } from '../types.js';
import { sendError } from '../errors.js';

const router = Router();

/**
 * @swagger
 * /goals:
 *   get:
 *     summary: Get all top-level goals
 *     tags: [Goals]
 *     responses:
 *       200:
 *         description: List of goals
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Goal'
 */
router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await trackedExecute({
      sql: `
      SELECT g.* FROM goals g
      WHERE g.is_active = 1
        AND g.user_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM goal_relations gr WHERE gr.child_goal_id = g.id
        )
      ORDER BY g.created_at DESC
    `,
      args: [userId]
    }, 'getAllTopLevelGoals');
    const goals = result.rows as unknown as GoalRow[];
    await recalculateFrequencyGoalsCurrentValue(goals);
    res.json(goals.map(goalRowToGoal));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /goals/{id}:
 *   get:
 *     summary: Get goal by ID
 *     tags: [Goals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Goal found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Goal'
 *       404:
 *         description: Goal not found
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await trackedExecute({
      sql: 'SELECT * FROM goals WHERE id = ? AND user_id = ?',
      args: [req.params.id, userId]
    }, 'getGoalById');
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    const goal = result.rows[0] as unknown as GoalRow;
    res.json(goalRowToGoal(goal));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /goals/{id}/stats:
 *   get:
 *     summary: Get goal statistics
 *     tags: [Goals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Goal stats with velocity, projections, sub-goals
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GoalStats'
 *       404:
 *         description: Goal not found
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const userId = getUserId(req);
    const goalResult = await trackedExecute({
      sql: 'SELECT * FROM goals WHERE id = ? AND user_id = ?',
      args: [req.params.id, userId]
    }, 'getGoalForStats');
    
    if (goalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    const goal = goalResult.rows[0] as unknown as GoalRow;

    const logsResult = await trackedExecute({
      sql: 'SELECT * FROM goal_logs WHERE goal_id = ? ORDER BY log_date DESC LIMIT 30',
      args: [req.params.id]
    }, 'getGoalLogsForStats');
    const logs = logsResult.rows as unknown as GoalLogRow[];

    // Get sub-goals via junction table
    const subGoalsResult = await trackedExecute({
      sql: `SELECT g.* FROM goals g
            INNER JOIN goal_relations gr ON gr.child_goal_id = g.id
            WHERE gr.parent_goal_id = ? AND g.is_active = 1 AND g.user_id = ?
            ORDER BY g.created_at ASC`,
      args: [req.params.id, userId]
    }, 'getSubGoalsForStats');
    const subGoals = subGoalsResult.rows as unknown as GoalRow[];
    await recalculateFrequencyGoalsCurrentValue(subGoals);

    const stats = calculateGoalStats(goal, logs, subGoals);
    res.json(stats);
  } catch (err) {
    sendError(res, err);
  }
});

// Get sub-goals for a parent goal (via junction table)
router.get('/:id/subgoals', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await trackedExecute({
      sql: `SELECT g.* FROM goals g
            INNER JOIN goal_relations gr ON gr.child_goal_id = g.id
            WHERE gr.parent_goal_id = ? AND g.is_active = 1 AND g.user_id = ?
            ORDER BY g.created_at ASC`,
      args: [req.params.id, userId]
    }, 'getSubGoals');
    const subGoals = result.rows as unknown as GoalRow[];
    res.json(subGoals.map(goalRowToGoal));
  } catch (err) {
    sendError(res, err);
  }
});

// Get goal logs
router.get('/:id/logs', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { limit = '30' } = req.query;

    const goalResult = await trackedExecute({
      sql: 'SELECT id FROM goals WHERE id = ? AND user_id = ?',
      args: [req.params.id, userId]
    }, 'checkGoalOwnershipForLogs');
    if (goalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    const result = await trackedExecute({
      sql: 'SELECT * FROM goal_logs WHERE goal_id = ? ORDER BY log_date DESC LIMIT ?',
      args: [req.params.id, parseInt(limit as string)]
    }, 'getGoalLogs');
    const logs = result.rows as unknown as GoalLogRow[];
    res.json(logs.map(goalLogRowToGoalLog));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /goals:
 *   post:
 *     summary: Create a new goal
 *     tags: [Goals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateGoalRequest'
 *     responses:
 *       201:
 *         description: Goal created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Goal'
 *       400:
 *         description: Title is required
 */
router.post('/', async (req, res) => {
  try {
    const userId = getUserId(req);
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
      const parentResult = await trackedExecute({
        sql: 'SELECT * FROM goals WHERE id = ? AND user_id = ?',
        args: [parentId, userId]
      }, 'verifyParentGoalExists');
      if (parentResult.rows.length === 0) {
        return res.status(404).json({ message: 'Parent goal not found' });
      }
    }

    const id = uuidv4();
    
    // Insert the goal
    await trackedExecute({
      sql: `INSERT INTO goals (id, title, goal_type, target_value, unit, total_pages, frequency_period, target_date, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        title,
        goalType,
        targetValue || 0,
        unit || '',
        goalType === 'reading' ? totalPages : null,
        goalType === 'frequency' ? (frequencyPeriod || 'weekly') : null,
        targetDate || null,
        userId
      ]
    }, 'createGoal');

    // If this is a sub-goal, create the relation
    if (parentId) {
      await trackedExecute({
        sql: `INSERT INTO goal_relations (parent_goal_id, child_goal_id, relation_type)
              VALUES (?, ?, 'subgoal')`,
        args: [parentId, id]
      }, 'createGoalRelation');
    }

    const goalResult = await trackedExecute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [id]
    }, 'getCreatedGoal');
    const goal = goalResult.rows[0] as unknown as GoalRow;
    res.status(201).json(goalRowToGoal(goal));
  } catch (err) {
    sendError(res, err);
  }
});

// Update goal
router.patch('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { title, targetValue, unit, totalPages, currentPage, currentValue, targetDate, isActive } = req.body;

    const existingResult = await trackedExecute({
      sql: 'SELECT * FROM goals WHERE id = ? AND user_id = ?',
      args: [id, userId]
    }, 'checkGoalExistsForUpdate');
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
      values.push(id, userId);
      await trackedExecute({
        sql: `UPDATE goals SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
        args: values
      }, 'updateGoal');
    }

    const goalResult = await trackedExecute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [id]
    }, 'getUpdatedGoal');
    const goal = goalResult.rows[0] as unknown as GoalRow;
    res.json(goalRowToGoal(goal));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /goals/{id}/logs:
 *   post:
 *     summary: Log progress for a goal
 *     tags: [Goals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateGoalLogRequest'
 *     responses:
 *       201:
 *         description: Progress logged
 *       400:
 *         description: Value is required
 *       404:
 *         description: Goal not found
 */
router.post('/:id/logs', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { value, note, logDate } = req.body;

    const goalResult = await trackedExecute({
      sql: 'SELECT * FROM goals WHERE id = ? AND user_id = ?',
      args: [id, userId]
    }, 'getGoalForLogging');
    if (goalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    const goal = goalResult.rows[0] as unknown as GoalRow;

    if (value === undefined || value === null) {
      return res.status(400).json({ message: 'Value is required' });
    }

    const date = logDate || new Date().toISOString().split('T')[0];

    // Upsert log - preserve existing note if no new note provided
    await trackedExecute({
      sql: `INSERT INTO goal_logs (goal_id, log_date, value, note)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(goal_id, log_date) DO UPDATE SET 
              value = excluded.value,
              note = COALESCE(excluded.note, note)`,
      args: [id, date, value, note || null]
    }, 'upsertGoalLog');

    // Update goal's current value based on type
    if (goal.goal_type === 'reading') {
      await trackedExecute({
        sql: 'UPDATE goals SET current_page = ? WHERE id = ?',
        args: [value, id]
      }, 'updateReadingProgress');
    } else if (goal.goal_type === 'frequency') {
      const periodStart = getPeriodStart(goal.frequency_period);
      
      const countResult = await trackedExecute({
        sql: `SELECT COUNT(*) as count FROM goal_logs 
              WHERE goal_id = ? AND log_date >= ? AND value = 1`,
        args: [id, periodStart]
      }, 'countFrequencyLogs');
      const count = (countResult.rows[0] as unknown as { count: number }).count;
      
      await trackedExecute({
        sql: 'UPDATE goals SET current_value = ? WHERE id = ?',
        args: [count, id]
      }, 'updateFrequencyProgress');
    } else {
      await trackedExecute({
        sql: 'UPDATE goals SET current_value = ? WHERE id = ?',
        args: [value, id]
      }, 'updateNumericProgress');
    }

    const logResult = await trackedExecute({
      sql: 'SELECT * FROM goal_logs WHERE goal_id = ? AND log_date = ?',
      args: [id, date]
    }, 'getCreatedLog');
    const log = logResult.rows[0] as unknown as GoalLogRow;

    const updatedGoalResult = await trackedExecute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [id]
    }, 'getGoalAfterLog');
    const updatedGoal = updatedGoalResult.rows[0] as unknown as GoalRow;

    res.status(201).json({
      log: goalLogRowToGoalLog(log),
      goal: goalRowToGoal(updatedGoal),
    });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * @swagger
 * /goals/{goalId}/logs/{logId}:
 *   patch:
 *     summary: Update a goal log
 *     tags: [Goals]
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: logId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 type: number
 *               note:
 *                 type: string
 *               logDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Log updated successfully
 *       404:
 *         description: Log not found
 */
router.patch('/:goalId/logs/:logId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { goalId, logId } = req.params;
    const { value, note, logDate } = req.body;

    // Check log exists (and its goal belongs to the user)
    const existingResult = await trackedExecute({
      sql: `SELECT gl.* FROM goal_logs gl
              JOIN goals g ON g.id = gl.goal_id
             WHERE gl.id = ? AND gl.goal_id = ? AND g.user_id = ?`,
      args: [logId, goalId, userId]
    }, 'getGoalLogForUpdate');
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Goal log not found' });
    }
    const existingLog = existingResult.rows[0] as unknown as GoalLogRow;

    // Get the goal for type info
    const goalResult = await trackedExecute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [goalId]
    }, 'getGoalForLogUpdate');
    if (goalResult.rows.length === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }
    const goal = goalResult.rows[0] as unknown as GoalRow;

    // Build update query
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (value !== undefined) {
      updates.push('value = ?');
      values.push(value);
    }
    if (note !== undefined) {
      updates.push('note = ?');
      values.push(note || null);
    }
    if (logDate !== undefined) {
      updates.push('log_date = ?');
      values.push(logDate);
    }

    if (updates.length > 0) {
      values.push(parseInt(logId));
      await trackedExecute({
        sql: `UPDATE goal_logs SET ${updates.join(', ')} WHERE id = ?`,
        args: values
      }, 'updateGoalLog');
    }

    // Recalculate goal progress if value changed
    if (value !== undefined) {
      if (goal.goal_type === 'reading') {
        // Get the latest log value for reading goals
        const latestResult = await trackedExecute({
          sql: 'SELECT value FROM goal_logs WHERE goal_id = ? ORDER BY log_date DESC, id DESC LIMIT 1',
          args: [goalId]
        }, 'getLatestReadingValue');
        const latestValue = (latestResult.rows[0] as unknown as { value: number })?.value || 0;
        await trackedExecute({
          sql: 'UPDATE goals SET current_page = ? WHERE id = ?',
          args: [latestValue, goalId]
        }, 'updateReadingProgressAfterEdit');
      } else if (goal.goal_type === 'frequency') {
        const periodStart = getPeriodStart(goal.frequency_period);
        
        const countResult = await trackedExecute({
          sql: `SELECT COUNT(*) as count FROM goal_logs 
                WHERE goal_id = ? AND log_date >= ? AND value = 1`,
          args: [goalId, periodStart]
        }, 'countFrequencyLogsAfterEdit');
        const count = (countResult.rows[0] as unknown as { count: number }).count;
        
        await trackedExecute({
          sql: 'UPDATE goals SET current_value = ? WHERE id = ?',
          args: [count, goalId]
        }, 'updateFrequencyProgressAfterEdit');
      } else {
        // Numeric - use latest log value
        const latestResult = await trackedExecute({
          sql: 'SELECT value FROM goal_logs WHERE goal_id = ? ORDER BY log_date DESC, id DESC LIMIT 1',
          args: [goalId]
        }, 'getLatestNumericValue');
        const latestValue = (latestResult.rows[0] as unknown as { value: number })?.value || 0;
        await trackedExecute({
          sql: 'UPDATE goals SET current_value = ? WHERE id = ?',
          args: [latestValue, goalId]
        }, 'updateNumericProgressAfterEdit');
      }
    }

    // Return updated log and goal
    const logResult = await trackedExecute({
      sql: 'SELECT * FROM goal_logs WHERE id = ?',
      args: [logId]
    }, 'getUpdatedGoalLog');
    const log = logResult.rows[0] as unknown as GoalLogRow;

    const updatedGoalResult = await trackedExecute({
      sql: 'SELECT * FROM goals WHERE id = ?',
      args: [goalId]
    }, 'getGoalAfterLogUpdate');
    const updatedGoal = updatedGoalResult.rows[0] as unknown as GoalRow;

    res.json({
      log: goalLogRowToGoalLog(log),
      goal: goalRowToGoal(updatedGoal),
    });
  } catch (err) {
    sendError(res, err);
  }
});

// Delete goal (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await trackedExecute({
      sql: 'UPDATE goals SET is_active = 0 WHERE id = ? AND user_id = ?',
      args: [req.params.id, userId]
    }, 'softDeleteGoal');

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    res.status(204).send();
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * For each frequency goal in the list, fetches logs and overwrites
 * current_value with the recalculated period count. Mutates goal objects.
 */
export async function recalculateFrequencyGoalsCurrentValue(
  goals: GoalRow[]
): Promise<void> {
  const frequencyGoals = goals.filter((g) => g.goal_type === 'frequency');
  if (frequencyGoals.length === 0) return;

  const ids = frequencyGoals.map((g) => g.id);
  const placeholders = ids.map(() => '?').join(',');
  const logsResult = await trackedExecute({
    sql: `SELECT goal_id, log_date, value FROM goal_logs 
          WHERE goal_id IN (${placeholders}) AND value = 1`,
    args: ids,
  }, 'getLogsForFrequencyGoals');
  const rows = logsResult.rows as unknown as { goal_id: string; log_date: string; value: number }[];

  const byGoal = new Map<string, { log_date: string; value: number }[]>();
  for (const r of rows) {
    const arr = byGoal.get(r.goal_id) ?? [];
    arr.push({ log_date: r.log_date, value: r.value });
    byGoal.set(r.goal_id, arr);
  }

  const now = new Date();
  for (const goal of frequencyGoals) {
    const goalLogs = byGoal.get(goal.id) ?? [];
    const periodStart = getPeriodStart(goal.frequency_period, now);
    goal.current_value = goalLogs.filter((l) => l.log_date >= periodStart).length;
  }
}

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
    const periodStart = getPeriodStart(goal.frequency_period);
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
