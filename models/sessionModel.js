const mongoose = require('mongoose');
const { dateTimeString, dateKey, startOfDay, daysAgoStart, isValidId } = require('./helpers');

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mode: { type: String, default: 'Study' },
  technique: { type: String, default: 'Custom' },
  startTime: { type: Date, required: true },
  endTime: { type: Date, default: null },
  durationMinutes: { type: Number, required: true },
  elapsedSeconds: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Paused', 'Completed', 'Stopped'], default: 'Active' },
});

const FocusSession = mongoose.models.FocusSession || mongoose.model('FocusSession', sessionSchema);

function serialize(doc) {
  if (!doc) return null;
  return {
    session_id: String(doc._id),
    user_id: String(doc.userId),
    mode: doc.mode,
    technique: doc.technique,
    start_time: dateTimeString(doc.startTime),
    end_time: dateTimeString(doc.endTime),
    duration_minutes: doc.durationMinutes,
    elapsed_seconds: doc.elapsedSeconds,
    status: doc.status,
  };
}

function rangeFilter(userId, range) {
  const query = { userId };
  if (range === 'today') query.startTime = { $gte: startOfDay() };
  else if (range === 'week') query.startTime = { $gte: daysAgoStart(6) };
  return query;
}

async function findById(sessionId, userId) {
  if (!isValidId(sessionId) || !isValidId(userId)) return null;
  const doc = await FocusSession.findOne({ _id: sessionId, userId }).lean();
  return serialize(doc);
}

async function create(userId, plannedMinutes) {
  const doc = await FocusSession.create({
    userId,
    startTime: new Date(),
    durationMinutes: plannedMinutes,
    elapsedSeconds: 0,
    status: 'Active',
  });
  return serialize(doc);
}

async function updateState(sessionId, userId, { elapsedSeconds, status }) {
  if (!isValidId(sessionId) || !isValidId(userId)) return null;
  const clamped = Math.max(0, Math.min(Math.round(elapsedSeconds), 86400));
  const $set = { elapsedSeconds: clamped, status };
  if (status === 'Completed' || status === 'Stopped') $set.endTime = new Date();
  const doc = await FocusSession.findOneAndUpdate({ _id: sessionId, userId }, { $set }, { new: true }).lean();
  return serialize(doc);
}

async function listByRange(userId, range) {
  const rows = await FocusSession.find(rangeFilter(userId, range)).sort({ startTime: -1 }).lean();
  return rows.map(serialize);
}

async function rangeTotals(userId, range) {
  const rows = await FocusSession.find(rangeFilter(userId, range)).lean();
  return {
    total_seconds: rows.reduce((sum, r) => sum + (r.elapsedSeconds || 0), 0),
    n: rows.length,
    completed: rows.filter((r) => r.status === 'Completed').length,
  };
}

async function dailyMinutes(userId, days) {
  const rows = await FocusSession.find({
    userId,
    startTime: { $gte: daysAgoStart(days) },
  }).lean();

  const byDay = new Map();
  for (const row of rows) {
    const d = dateKey(row.startTime);
    if (!d) continue;
    const cur = byDay.get(d) || { d, seconds: 0, completed: 0 };
    cur.seconds += row.elapsedSeconds || 0;
    if (row.status === 'Completed') cur.completed += 1;
    byDay.set(d, cur);
  }
  return [...byDay.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
}

async function allForExport(userId) {
  const rows = await FocusSession.find({ userId }).sort({ startTime: 1 }).lean();
  return rows.map(serialize);
}

async function totals(userId) {
  const rows = await FocusSession.find({ userId }).lean();
  const seconds = rows.reduce((sum, r) => sum + (r.elapsedSeconds || 0), 0);
  const max_seconds = rows.reduce((max, r) => Math.max(max, r.elapsedSeconds || 0), 0);
  return { sessions: rows.length, seconds, max_seconds };
}

module.exports = { findById, create, updateState, listByRange, rangeTotals, dailyMinutes, allForExport, totals };
