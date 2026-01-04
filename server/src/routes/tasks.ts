import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';
import type { TaskRow, SubTaskRow } from '../types.js';
import { taskRowToTask, subTaskRowToSubTask } from '../types.js';

const router = Router();

// Get all tasks with subtasks
router.get('/', (_req, res) => {
  const tasks = db.prepare(`
    SELECT * FROM tasks WHERE parent_id IS NULL ORDER BY 
      CASE WHEN deadline IS NOT NULL THEN 0 ELSE 1 END,
      deadline ASC,
      created_at DESC
  `).all() as TaskRow[];

  const result = tasks.map((task) => {
    const subTaskRows = db.prepare(`
      SELECT * FROM subtasks WHERE task_id = ? ORDER BY created_at ASC
    `).all(task.id) as SubTaskRow[];
    
    const subTasks = subTaskRows.map(subTaskRowToSubTask);
    return taskRowToTask(task, subTasks);
  });

  res.json(result);
});

// Get single task
router.get('/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as TaskRow | undefined;
  
  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  const subTaskRows = db.prepare('SELECT * FROM subtasks WHERE task_id = ?').all(task.id) as SubTaskRow[];
  const subTasks = subTaskRows.map(subTaskRowToSubTask);
  
  res.json(taskRowToTask(task, subTasks));
});

// Create task
router.post('/', (req, res) => {
  const { title, category = 'Personal', deadline, parentId } = req.body;
  
  if (!title) {
    return res.status(400).json({ message: 'Title is required' });
  }

  const id = uuidv4();
  
  db.prepare(`
    INSERT INTO tasks (id, parent_id, title, category, deadline)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, parentId || null, title, category, deadline || null);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow;
  res.status(201).json(taskRowToTask(task, []));
});

// Update task
router.patch('/:id', (req, res) => {
  const { title, category, deadline, isCompleted } = req.body;
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  if (!existing) {
    return res.status(404).json({ message: 'Task not found' });
  }

  // If trying to complete a task with incomplete subtasks, reject
  if (isCompleted === true) {
    const incompleteSubtasks = db.prepare(`
      SELECT COUNT(*) as count FROM subtasks WHERE task_id = ? AND completed = 0
    `).get(id) as { count: number };
    
    if (incompleteSubtasks.count > 0) {
      return res.status(400).json({ 
        message: 'Cannot complete task with incomplete subtasks' 
      });
    }
  }

  const updates: string[] = [];
  const values: unknown[] = [];

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
    db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow;
  const subTaskRows = db.prepare('SELECT * FROM subtasks WHERE task_id = ?').all(id) as SubTaskRow[];
  const subTasks = subTaskRows.map(subTaskRowToSubTask);
  
  res.json(taskRowToTask(task, subTasks));
});

// Delete task
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  
  if (result.changes === 0) {
    return res.status(404).json({ message: 'Task not found' });
  }

  res.status(204).send();
});

// Add subtask
router.post('/:taskId/subtasks', (req, res) => {
  const { taskId } = req.params;
  const { text } = req.body;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow | undefined;
  if (!task) {
    return res.status(404).json({ message: 'Task not found' });
  }

  if (!text) {
    return res.status(400).json({ message: 'Text is required' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO subtasks (id, task_id, text) VALUES (?, ?, ?)
  `).run(id, taskId, text);

  // If task was completed, uncomplete it since we added a new subtask
  if (task.is_completed) {
    db.prepare('UPDATE tasks SET is_completed = 0 WHERE id = ?').run(taskId);
  }

  const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow;
  const subTaskRows = db.prepare('SELECT * FROM subtasks WHERE task_id = ?').all(taskId) as SubTaskRow[];
  const subTasks = subTaskRows.map(subTaskRowToSubTask);
  
  res.status(201).json(taskRowToTask(updatedTask, subTasks));
});

// Update subtask
router.patch('/:taskId/subtasks/:subTaskId', (req, res) => {
  const { taskId, subTaskId } = req.params;
  const { completed } = req.body;

  const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ? AND task_id = ?')
    .get(subTaskId, taskId) as SubTaskRow | undefined;
  
  if (!subtask) {
    return res.status(404).json({ message: 'Subtask not found' });
  }

  if (completed !== undefined) {
    db.prepare('UPDATE subtasks SET completed = ? WHERE id = ?')
      .run(completed ? 1 : 0, subTaskId);
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow;
  const subTaskRows = db.prepare('SELECT * FROM subtasks WHERE task_id = ?').all(taskId) as SubTaskRow[];
  const subTasks = subTaskRows.map(subTaskRowToSubTask);
  
  res.json(taskRowToTask(task, subTasks));
});

// Delete subtask
router.delete('/:taskId/subtasks/:subTaskId', (req, res) => {
  const { taskId, subTaskId } = req.params;

  const result = db.prepare('DELETE FROM subtasks WHERE id = ? AND task_id = ?')
    .run(subTaskId, taskId);

  if (result.changes === 0) {
    return res.status(404).json({ message: 'Subtask not found' });
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as TaskRow;
  const subTaskRows = db.prepare('SELECT * FROM subtasks WHERE task_id = ?').all(taskId) as SubTaskRow[];
  const subTasks = subTaskRows.map(subTaskRowToSubTask);
  
  res.json(taskRowToTask(task, subTasks));
});

export default router;

