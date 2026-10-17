const express = require('express');
const sessions = require('../models/sessionModel');

const router = express.Router();

const STATES = ['Active', 'Paused', 'Completed', 'Stopped'];

router.post('/', async (req, res) => {
  const plannedMinutes = Number(req.body.plannedMinutes);
  if (!Number.isInteger(plannedMinutes) || plannedMinutes < 1 || plannedMinutes > 1440) {
    return res.status(400).json({ error: 'Plan a session between 1 and 1440 minutes.' });
  }
  const session = await sessions.create(req.session.userId, plannedMinutes);
  res.status(201).json({ session });
});

router.put('/:id', async (req, res) => {
  const session = await sessions.findById(req.params.id, req.session.userId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  const { status } = req.body;
  if (!STATES.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const elapsedSeconds = Number(req.body.elapsedSeconds) || 0;
  const updated = await sessions.updateState(session.session_id, req.session.userId, {
    elapsedSeconds,
    status,
  });
  res.json({ session: updated });
});

const RANGES = ['today', 'week', 'all'];

router.get('/', async (req, res) => {
  const range = RANGES.includes(req.query.range) ? req.query.range : 'today';
  const [list, totals] = await Promise.all([
    sessions.listByRange(req.session.userId, range),
    sessions.rangeTotals(req.session.userId, range),
  ]);
  res.json({ sessions: list, totals });
});

module.exports = router;
