const mongoose = require('mongoose');
const { dateTimeString, dateKey, isValidId } = require('./helpers');

const intentionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    text: { type: String, required: true, maxlength: 500 },
    normalizedText: { type: String, required: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    achieved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

intentionSchema.index({ userId: 1, date: 1, normalizedText: 1 }, { unique: true });

const DailyIntention =
  mongoose.models.DailyIntention || mongoose.model('DailyIntention', intentionSchema);

function normalizeText(text) {
  return text.trim().toLowerCase();
}

function serialize(doc) {
  if (!doc) return null;
  return {
    goal_id: String(doc._id),
    intention_id: String(doc._id),
    user_id: String(doc.userId),
    date: doc.date,
    text: doc.text,
    task_id: doc.taskId ? String(doc.taskId) : null,
    achieved: Boolean(doc.achieved),
    created_at: dateTimeString(doc.createdAt),
    updated_at: dateTimeString(doc.updatedAt),
  };
}

function todayKey() {
  return dateKey(new Date());
}

async function listForDate(userId, date = todayKey()) {
  if (!isValidId(userId)) return [];
  const rows = await DailyIntention.find({ userId, date }).sort({ createdAt: 1, _id: 1 }).lean();
  return rows.map(serialize);
}

async function findByIdForDate(goalId, userId, date = todayKey()) {
  if (!isValidId(goalId) || !isValidId(userId)) return null;
  const doc = await DailyIntention.findOne({ _id: goalId, userId, date }).lean();
  return serialize(doc);
}

async function createForDate(userId, { text, taskId = null }, date = todayKey()) {
  if (!isValidId(userId)) return null;
  const doc = await DailyIntention.create({
    userId,
    date,
    text,
    normalizedText: normalizeText(text),
    taskId,
    achieved: false,
  });
  return serialize(doc);
}

async function updateText(goalId, userId, text, date = todayKey()) {
  if (!isValidId(goalId) || !isValidId(userId)) return null;
  const filter = { _id: goalId, userId, date };
  const existing = await DailyIntention.findOne(filter).select('text taskId achieved').lean();
  if (!existing) return null;
  const changed = existing.text !== text;
  const doc = await DailyIntention.findOneAndUpdate(
    filter,
    {
      $set: {
        text,
        normalizedText: normalizeText(text),
        ...(changed && !existing.taskId ? { achieved: false } : {}),
      },
    },
    { new: true, runValidators: true }
  ).lean();
  return serialize(doc);
}

async function setAchievement(goalId, userId, achieved, date = todayKey()) {
  if (!isValidId(goalId) || !isValidId(userId)) return null;
  const doc = await DailyIntention.findOneAndUpdate(
    { _id: goalId, userId, date, taskId: null },
    { $set: { achieved } },
    { new: true, runValidators: true }
  ).lean();
  return serialize(doc);
}

async function initialize() {
  const collection = DailyIntention.collection;
  const exists = await mongoose.connection.db
    .listCollections({ name: collection.name }, { nameOnly: true })
    .hasNext();
  if (!exists) await DailyIntention.createCollection();

  // Backfill legacy single-intention documents without deleting or rewriting their text.
  const cursor = collection.find(
    { $or: [{ normalizedText: { $exists: false } }, { normalizedText: null }] },
    { projection: { _id: 1, text: 1 } }
  );
  for await (const doc of cursor) {
    const text = typeof doc.text === 'string' ? doc.text.trim() : '';
    const normalizedText = normalizeText(text) || `legacy:${doc._id}`;
    await collection.updateOne({ _id: doc._id }, { $set: { normalizedText } });
  }

  await collection.createIndex(
    { userId: 1, date: 1, normalizedText: 1 },
    { unique: true, name: 'userId_1_date_1_normalizedText_1' }
  );

  const indexes = await collection.indexes();
  const oldUniqueDailyIndex = indexes.find(
    (index) =>
      index.unique &&
      Object.keys(index.key).length === 2 &&
      index.key.userId === 1 &&
      index.key.date === 1
  );
  if (oldUniqueDailyIndex) await collection.dropIndex(oldUniqueDailyIndex.name);

  await DailyIntention.init();
}

module.exports = {
  listForDate,
  findByIdForDate,
  createForDate,
  updateText,
  setAchievement,
  todayKey,
  initialize,
};
