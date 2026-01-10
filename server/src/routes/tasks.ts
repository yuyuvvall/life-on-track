import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { trackedExecute } from '../db/index.js';
import type { TaskRow, SubTaskRow } from '../types.js';
import { taskRowToTask, subTaskRowToSubTask } from '../types.js';

const router = Router();

/**
 * @swagger
 * /tasks:
 *   get:
 *     summary: Get all tasks
 *     tags: [Tasks]
 *     parameters:
 *       - in: header
 *         name: X-Purpose
 *         schema:
 *           type: string
 *         description: UI purpose for logging
 *     responses:
 *       200:
 *         description: List of tasks with subtasks
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 */
router.get('/', async (_req, res) => {
  try {
    const tasksResult = await trackedExecute(`
      SELECT * FROM tasks WHERE parent_id IS NULL ORDER BY 
        CASE WHEN deadline IS NOT NULL THEN 0 ELSE 1 END,
        deadline ASC,
        created_at DESC
    `, 'getAllTasks');
    const tasks = tasksResult.rows as unknown as TaskRow[];

    const result = await Promise.all(tasks.map(async (task) => {
      const subTasksResult = await trackedExecute({
        sql: 'SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at ASC',
        args: [task.id]
      }, 'getSubtasksForTask');
      const subTaskRows = subTasksResult.rows as unknown as SubTaskRow[];
      const subTasks = subTaskRows.map(subTaskRowToSubTask);
      return taskRowToTask(task, subTasks);
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /tasks/{id}:
 *   get:
 *     summary: Get task by ID
 *     tags: [Tasks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       404:
 *         description: Task not found
 */
router.get('/:id', async (req, res) => {
  try {
    const taskResult = await trackedExecute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [req.params.id]
    }, 'getTaskById');
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const task = taskResult.rows[0] as unknown as TaskRow;
    const subTasksResult = await trackedExecute({
      sql: 'SELECT * FROM subtasks WHERE task_id = ?',
      args: [task.id]
    }, 'getSubtasksForSingleTask');
    const subTaskRows = subTasksResult.rows as unknown as SubTaskRow[];
    const subTasks = subTaskRows.map(subTaskRowToSubTask);
    
    res.json(taskRowToTask(task, subTasks));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /tasks:
 *   post:
 *     summary: Create a new task
 *     tags: [Tasks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTaskRequest'
 *     responses:
 *       201:
 *         description: Task created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *       400:
 *         description: Title is required
 */
router.post('/', async (req, res) => {
  try {
    const { title, category = 'Personal', deadline, parentId } = req.body;
    
    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const id = uuidv4();
    
    await trackedExecute({
      sql: `INSERT INTO tasks (id, parent_id, title, category, deadline)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, parentId || null, title, category, deadline || null]
    }, 'createTask');

    const taskResult = await trackedExecute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [id]
    }, 'getCreatedTask');
    const task = taskResult.rows[0] as unknown as TaskRow;
    res.status(201).json(taskRowToTask(task, []));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /tasks/{id}:
 *   patch:
 *     summary: Update a task
 *     tags: [Tasks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTaskRequest'
 *     responses:
 *       200:
 *         description: Task updated
 *       400:
 *         description: Cannot complete task with incomplete subtasks
 *       404:
 *         description: Task not found
 */
router.patch('/:id', async (req, res) => {
  try {
    const { title, category, deadline, isCompleted } = req.body;
    const { id } = req.params;

    const existingResult = await trackedExecute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [id]
    }, 'checkTaskExistsForUpdate');
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }

    // If trying to complete a task with incomplete subtasks, reject
    if (isCompleted === true) {
      const countResult = await trackedExecute({
        sql: 'SELECT COUNT(*) as count FROM subtasks WHERE task_id = ? AND completed = 0',
        args: [id]
      }, 'countIncompleteSubtasks');
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
      await trackedExecute({
        sql: `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
        args: values
      }, 'updateTask');
    }

    const taskResult = await trackedExecute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [id]
    }, 'getUpdatedTask');
    const task = taskResult.rows[0] as unknown as TaskRow;
    
    const subTasksResult = await trackedExecute({
      sql: 'SELECT * FROM subtasks WHERE task_id = ?',
      args: [id]
    }, 'getSubtasksAfterUpdate');
    const subTaskRows = subTasksResult.rows as unknown as SubTaskRow[];
    const subTasks = subTaskRows.map(subTaskRowToSubTask);
    
    res.json(taskRowToTask(task, subTasks));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

/**
 * @swagger
 * /tasks/{id}:
 *   delete:
 *     summary: Delete a task
 *     tags: [Tasks]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Task deleted
 *       404:
 *         description: Task not found
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await trackedExecute({
      sql: 'DELETE FROM tasks WHERE id = ?',
      args: [req.params.id]
    }, 'deleteTask');
    
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

    const taskResult = await trackedExecute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [taskId]
    }, 'getTaskForSubtask');
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }
    const task = taskResult.rows[0] as unknown as TaskRow;

    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }

    const id = uuidv4();
    await trackedExecute({
      sql: 'INSERT INTO subtasks (id, task_id, text) VALUES (?, ?, ?)',
      args: [id, taskId, text]
    }, 'createSubtask');

    // If task was completed, uncomplete it since we added a new subtask
    if (task.is_completed) {
      await trackedExecute({
        sql: 'UPDATE tasks SET is_completed = 0 WHERE id = ?',
        args: [taskId]
      }, 'uncompleteTaskAfterSubtask');
    }

    const updatedTaskResult = await trackedExecute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [taskId]
    }, 'getTaskAfterSubtaskAdd');
    const updatedTask = updatedTaskResult.rows[0] as unknown as TaskRow;
    
    const subTasksResult = await trackedExecute({
      sql: 'SELECT * FROM subtasks WHERE task_id = ?',
      args: [taskId]
    }, 'getSubtasksAfterAdd');
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
    const { completed, text } = req.body;

    const subtaskResult = await trackedExecute({
      sql: 'SELECT * FROM subtasks WHERE id = ? AND task_id = ?',
      args: [subTaskId, taskId]
    }, 'checkSubtaskExists');
    
    if (subtaskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Subtask not found' });
    }

    if (completed !== undefined) {
      await trackedExecute({
        sql: 'UPDATE subtasks SET completed = ? WHERE id = ?',
        args: [completed ? 1 : 0, subTaskId]
      }, 'updateSubtaskCompleted');
    }

    if (text !== undefined) {
      await trackedExecute({
        sql: 'UPDATE subtasks SET text = ? WHERE id = ?',
        args: [text, subTaskId]
      }, 'updateSubtaskText');
    }

    const taskResult = await trackedExecute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [taskId]
    }, 'getTaskAfterSubtaskUpdate');
    const task = taskResult.rows[0] as unknown as TaskRow;
    
    const subTasksResult = await trackedExecute({
      sql: 'SELECT * FROM subtasks WHERE task_id = ?',
      args: [taskId]
    }, 'getSubtasksAfterUpdate');
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

    const result = await trackedExecute({
      sql: 'DELETE FROM subtasks WHERE id = ? AND task_id = ?',
      args: [subTaskId, taskId]
    }, 'deleteSubtask');

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: 'Subtask not found' });
    }

    const taskResult = await trackedExecute({
      sql: 'SELECT * FROM tasks WHERE id = ?',
      args: [taskId]
    }, 'getTaskAfterSubtaskDelete');
    const task = taskResult.rows[0] as unknown as TaskRow;
    
    const subTasksResult = await trackedExecute({
      sql: 'SELECT * FROM subtasks WHERE task_id = ?',
      args: [taskId]
    }, 'getSubtasksAfterDelete');
    const subTaskRows = subTasksResult.rows as unknown as SubTaskRow[];
    const subTasks = subTaskRows.map(subTaskRowToSubTask);
    
    res.json(taskRowToTask(task, subTasks));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
