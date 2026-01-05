import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import type { TaskRow, SubTaskRow } from '../types.js';
import { taskRowToTask, subTaskRowToSubTask } from '../types.js';

const router = Router();

// Get all tasks with subtasks
router.get('/', async (_req, res) => {
  try {
    const tasksResult = await db.execute(`
      SELECT * FROM tasks WHERE parent_id IS NULL ORDER BY 
        CASE WHEN deadline IS NOT NULL THEN 0 ELSE 1 END,
        deadline ASC,
        created_at DESC
    `);
    const tasks = tasksResult.rows as unknown as TaskRow[];

    const result = await Promise.all(tasks.map(async (task) => {
      const subTasksResult = await db.execute({
        sql: 'SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at ASC',
        args: [task.id]
      });
      const subTaskRows = subTasksResult.rows as unknown as SubTaskRow[];
      const subTasks = subTaskRows.map(subTaskRowToSubTask);
      return taskRowToTask(task, subTasks);
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Get single task
router.get('/:id', async (req, res) => {
  try {
    const taskResult = await db.execute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [req.params.id]
    });
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const task = taskResult.rows[0] as unknown as TaskRow;
    const subTasksResult = await db.execute({
      sql: 'SELECT * FROM subtasks WHERE task_id = ?',
      args: [task.id]
    });
    const subTaskRows = subTasksResult.rows as unknown as SubTaskRow[];
    const subTasks = subTaskRows.map(subTaskRowToSubTask);
    
    res.json(taskRowToTask(task, subTasks));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Create task
router.post('/', async (req, res) => {
  try {
    const { title, category = 'Personal', deadline, parentId } = req.body;
    
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const id = uuidv4();
    
    await db.execute({
      sql: `INSERT INTO tasks (id, parent_id, title, category, deadline)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, parentId || null, title, category, deadline || null]
    });

    const taskResult = await db.execute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [id]
    });
    const task = taskResult.rows[0] as unknown as TaskRow;
    res.status(201).json(taskRowToTask(task, []));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Update task
router.patch('/:id', async (req, res) => {
  try {
    const { title, category, deadline, isCompleted } = req.body;
    const { id } = req.params;

    const existingResult = await db.execute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [id]
    });
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // If trying to complete a task with incomplete subtasks, reject
    if (isCompleted === true) {
      const countResult = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM subtasks WHERE task_id = ? AND completed = 0',
        args: [id]
      });
      const count = (countResult.rows[0] as unknown as { count: number }).count;
      
      if (count > 0) {
        return res.status(400).json({ 
          message: 'Cannot complete task with incomplete subtasks' 
        });
      }
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (deadline !== undefined) {
      updates.push('deadline = ?');
      values.push(deadline);
    }
    if (isCompleted !== undefined) {
      updates.push('is_completed = ?');
      values.push(isCompleted ? 1 : 0);
    }

    if (updates.length > 0) {
      values.push(id);
      await db.execute({
        sql: `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
        args: values
      });
    }

    const taskResult = await db.execute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [id]
    });
    const task = taskResult.rows[0] as unknown as TaskRow;
    
    const subTasksResult = await db.execute({
      sql: 'SELECT * FROM subtasks WHERE task_id = ?',
      args: [id]
    });
    const subTaskRows = subTasksResult.rows as unknown as SubTaskRow[];
    const subTasks = subTaskRows.map(subTaskRowToSubTask);
    
    res.json(taskRowToTask(task, subTasks));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Delete task
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'DELETE FROM tasks WHERE id = ?',
      args: [req.params.id]
    });
    
    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Add subtask
router.post('/:taskId/subtasks', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { text } = req.body;

    const taskResult = await db.execute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [taskId]
    });
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }
    const task = taskResult.rows[0] as unknown as TaskRow;

    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }

    const id = uuidv4();
    await db.execute({
      sql: 'INSERT INTO subtasks (id, task_id, text) VALUES (?, ?, ?)',
      args: [id, taskId, text]
    });

    // If task was completed, uncomplete it since we added a new subtask
    if (task.is_completed) {
      await db.execute({
        sql: 'UPDATE tasks SET is_completed = 0 WHERE id = ?',
        args: [taskId]
      });
    }

    const updatedTaskResult = await db.execute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [taskId]
    });
    const updatedTask = updatedTaskResult.rows[0] as unknown as TaskRow;
    
    const subTasksResult = await db.execute({
      sql: 'SELECT * FROM subtasks WHERE task_id = ?',
      args: [taskId]
    });
    const subTaskRows = subTasksResult.rows as unknown as SubTaskRow[];
    const subTasks = subTaskRows.map(subTaskRowToSubTask);
    
    res.status(201).json(taskRowToTask(updatedTask, subTasks));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Update subtask
router.patch('/:taskId/subtasks/:subTaskId', async (req, res) => {
  try {
    const { taskId, subTaskId } = req.params;
    const { completed } = req.body;

    const subtaskResult = await db.execute({
      sql: 'SELECT * FROM subtasks WHERE id = ? AND task_id = ?',
      args: [subTaskId, taskId]
    });
    
    if (subtaskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Subtask not found' });
    }

    if (completed !== undefined) {
      await db.execute({
        sql: 'UPDATE subtasks SET completed = ? WHERE id = ?',
        args: [completed ? 1 : 0, subTaskId]
      });
    }

    const taskResult = await db.execute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [taskId]
    });
    const task = taskResult.rows[0] as unknown as TaskRow;
    
    const subTasksResult = await db.execute({
      sql: 'SELECT * FROM subtasks WHERE task_id = ?',
      args: [taskId]
    });
    const subTaskRows = subTasksResult.rows as unknown as SubTaskRow[];
    const subTasks = subTaskRows.map(subTaskRowToSubTask);
    
    res.json(taskRowToTask(task, subTasks));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Delete subtask
router.delete('/:taskId/subtasks/:subTaskId', async (req, res) => {
  try {
    const { taskId, subTaskId } = req.params;

    const result = await db.execute({
      sql: 'DELETE FROM subtasks WHERE id = ? AND task_id = ?',
      args: [subTaskId, taskId]
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Subtask not found' });
    }

    const taskResult = await db.execute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [taskId]
    });
    const task = taskResult.rows[0] as unknown as TaskRow;
    
    const subTasksResult = await db.execute({
      sql: 'SELECT * FROM subtasks WHERE task_id = ?',
      args: [taskId]
    });
    const subTaskRows = subTasksResult.rows as unknown as SubTaskRow[];
    const subTasks = subTaskRows.map(subTaskRowToSubTask);
    
    res.json(taskRowToTask(task, subTasks));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
