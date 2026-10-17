const express = require('express');
const tasks = require('../models/taskModel');

const router = express.Router();

const PRIORITIES = ['High', 'Medium', 'Low'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', async (req, res) => {
  const filter = req.query.filter || 'all';
  const rows = await tasks.listByUser(req.session.userId, filter);
  res.json({ tasks: rows });
});

router.post('/', async (req, res) => {
  const title = (req.body.title || '').trim();
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : 'Medium';
  const dueDate = req.body.dueDate;
  if (!title || title.length > 255) {
    return res.status(400).json({ error: 'Enter a task title (max 255 characters).' });
  }
  if (dueDate && !DATE_RE.test(dueDate)) {
    return res.status(400).json({ error: 'Invalid due date.' });
  }
  const task = await tasks.create(req.session.userId, { title, priority, dueDate });
  res.status(201).json({ task });
});

router.put('/:id', async (req, res) => {
  const task = await tasks.findById(req.params.id, req.session.userId);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  if (req.body.priority && !PRIORITIES.includes(req.body.priority)) {
    return res.status(400).json({ error: 'Invalid priority.' });
  }
  if (req.body.status && !['Pending', 'Completed'].includes(req.body.status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  if ('dueDate' in req.body && req.body.dueDate && !DATE_RE.test(req.body.dueDate)) {
    return res.status(400).json({ error: 'Invalid due date.' });
  }
  const updated = await tasks.update(task.task_id, req.session.userId, req.body);
  res.json({ task: updated });
});

router.delete('/:id', async (req, res) => {
  await tasks.remove(req.params.id, req.session.userId);
  res.json({ ok: true });
});

module.exports = router;
