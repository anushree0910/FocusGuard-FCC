const express = require('express');
const intentions = require('../models/intentionModel');
const tasks = require('../models/taskModel');

const router = express.Router();

async function includeLinkedTask(goal, userId) {
  if (!goal || !goal.task_id) return { ...goal, task: null };
  const task = await tasks.findById(goal.task_id, userId);
  return {
    ...goal,
    task: task ? { task_id: task.task_id, title: task.title, status: task.status } : null,
  };
}

function isDuplicateError(err) {
  return err && err.code === 11000;
}

router.get('/today', async (req, res) => {
  const date = intentions.todayKey();
  const rows = await intentions.listForDate(req.session.userId, date);
  const goals = await Promise.all(rows.map((goal) => includeLinkedTask(goal, req.session.userId)));
  res.json({ goals, date });
});

router.post('/today', async (req, res) => {
  const body = req.body || {};
  const userId = req.session.userId;
  const date = intentions.todayKey();
  let text;
  let taskId = null;

  if (body.taskId !== undefined && body.taskId !== null) {
    if (typeof body.taskId !== 'string' || !body.taskId.trim()) {
      return res.status(400).json({ error: 'Select a valid task.' });
    }
    const task = await tasks.findById(body.taskId.trim(), userId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    text = task.title;
    taskId = task.task_id;
  } else {
    text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 500) {
      return res.status(400).json({ error: 'Enter a goal (max 500 characters).' });
    }
  }

  try {
    const goal = await intentions.createForDate(userId, { text, taskId }, date);
    return res.status(201).json({ goal: await includeLinkedTask(goal, userId) });
  } catch (err) {
    if (isDuplicateError(err)) {
      return res.status(409).json({ error: 'A goal with this text already exists today.' });
    }
    throw err;
  }
});

router.put('/:id/achievement', async (req, res) => {
  const body = req.body || {};
  if (typeof body.achieved !== 'boolean') {
    return res.status(400).json({ error: 'Achievement status must be true or false.' });
  }
  const goal = await intentions.setAchievement(
    req.params.id,
    req.session.userId,
    body.achieved,
    intentions.todayKey()
  );
  if (!goal) return res.status(404).json({ error: 'Personal goal not found for today.' });
  res.json({ goal });
});

router.put('/:id', async (req, res) => {
  const body = req.body || {};
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 500) {
    return res.status(400).json({ error: 'Enter a goal (max 500 characters).' });
  }
  try {
    const goal = await intentions.updateText(
      req.params.id,
      req.session.userId,
      text,
      intentions.todayKey()
    );
    if (!goal) return res.status(404).json({ error: 'Goal not found for today.' });
    res.json({ goal: await includeLinkedTask(goal, req.session.userId) });
  } catch (err) {
    if (isDuplicateError(err)) {
      return res.status(409).json({ error: 'A goal with this text already exists today.' });
    }
    throw err;
  }
});

module.exports = router;
