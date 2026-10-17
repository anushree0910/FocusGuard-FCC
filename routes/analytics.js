const express = require('express');
const sessions = require('../models/sessionModel');

const router = express.Router();

router.get('/weekly', async (req, res) => {
  const rows = await sessions.dailyMinutes(req.session.userId, 6);
  const byDate = new Map(rows.map((r) => [r.d, r]));

  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
    const row = byDate.get(key);
    days.push({
      date: key,
      minutes: Math.round((Number(row?.seconds) || 0) / 60),
      completed: Number(row?.completed) || 0,
    });
  }

  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
  const completedSessions = days.reduce((sum, d) => sum + d.completed, 0);
  const best = days.reduce((a, b) => (b.minutes > a.minutes ? b : a), days[0]);
  const dayName = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
  };

  res.json({
    days,
    totalMinutes,
    completedSessions,
    dailyAverage: Math.round(totalMinutes / 7),
    mostProductiveDay: best.minutes > 0 ? dayName(best.date) : null,
  });
});

module.exports = router;
