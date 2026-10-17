const express = require('express');
const bcrypt = require('bcryptjs');
const users = require('../models/userModel');
const tasks = require('../models/taskModel');
const sessions = require('../models/sessionModel');

const router = express.Router();

const EMAIL_RE = /^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const dateKey = (d) =>
  d.getFullYear() +
  '-' +
  String(d.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(d.getDate()).padStart(2, '0');

function computeStreak(dailyRows) {
  const active = new Set(dailyRows.filter((r) => Number(r.seconds) > 0).map((r) => r.d));
  const day = new Date();
  if (!active.has(dateKey(day))) day.setDate(day.getDate() - 1);
  let streak = 0;
  while (active.has(dateKey(day))) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

const ACHIEVEMENTS = [
  { name: 'First Focus', description: 'Complete your first focus session', need: (s) => s.totalSessions >= 1 },
  { name: 'Warm Up', description: 'Complete 5 focus sessions', need: (s) => s.totalSessions >= 5 },
  { name: 'Collector', description: 'Complete 15 focus sessions', need: (s) => s.totalSessions >= 15 },
  { name: 'Deep Worker', description: 'Focus for 45 minutes in one session', need: (s) => s.maxSeconds >= 2700 },
  { name: 'Marathoner', description: 'Reach 300 total focus minutes', need: (s) => s.totalMinutes >= 300 },
  { name: 'Task Finisher', description: 'Complete 5 tasks', need: (s) => s.tasksCompleted >= 5 },
  { name: 'Weekly Streak', description: 'Focus 5 days in a row', need: (s) => s.streak >= 5 },
  { name: 'Legend', description: '25 sessions and 10 completed tasks', need: (s) => s.totalSessions >= 25 && s.tasksCompleted >= 10 },
];

router.get('/', async (req, res) => {
  const userId = req.session.userId;
  const [user, sessionTotals, tasksCompleted, daily, today] = await Promise.all([
    users.findById(userId),
    sessions.totals(userId),
    tasks.countCompleted(userId),
    sessions.dailyMinutes(userId, 365),
    sessions.rangeTotals(userId, 'today'),
  ]);

  const stats = {
    totalSessions: Number(sessionTotals.sessions),
    totalMinutes: Math.floor(Number(sessionTotals.seconds) / 60),
    maxSeconds: Number(sessionTotals.max_seconds),
    tasksCompleted,
    streak: computeStreak(daily),
    todayMinutes: Math.floor(Number(today.total_seconds) / 60),
    todaySessions: Number(today.n),
  };

  const heatmapDays = [];
  const start = new Date();
  start.setDate(start.getDate() - 181);
  const startKey = dateKey(start);
  for (const row of daily) {
    if (row.d >= startKey) {
      heatmapDays.push({ date: row.d, minutes: Math.floor(Number(row.seconds) / 60) });
    }
  }

  res.json({
    user,
    stats,
    achievements: ACHIEVEMENTS.map((a) => ({
      name: a.name,
      description: a.description,
      unlocked: a.need(stats),
    })),
    heatmapDays,
  });
});

router.put('/', async (req, res) => {
  const fullName = (req.body.fullName || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  if (!fullName || fullName.length > 100) {
    return res.status(400).json({ error: 'Please enter your name (max 100 characters).' });
  }
  if (!EMAIL_RE.test(email) || email.length > 150) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const existing = await users.findByEmail(email);
  if (existing && existing.user_id !== req.session.userId) {
    return res.status(409).json({ error: 'That email is already used by another account.' });
  }
  const user = await users.updateProfile(req.session.userId, fullName, email);
  res.json({ user });
});

router.put('/password', async (req, res) => {
  const currentPassword = req.body.currentPassword || '';
  const newPassword = req.body.newPassword || '';
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Use a password with at least 8 characters.' });
  }
  const passwordHash = await users.getPasswordHash(req.session.userId);
  if (!passwordHash) return res.status(401).json({ error: 'Not signed in.' });
  const ok = await bcrypt.compare(currentPassword, passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await users.updatePassword(req.session.userId, hash);
  res.json({ ok: true });
});

module.exports = router;
