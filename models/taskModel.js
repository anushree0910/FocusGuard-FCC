const mongoose = require('mongoose');
const { dateTimeString, dateKey, isValidId } = require('./helpers');

const taskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 255 },
    status: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },
    priority: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
    dueDate: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const Task = mongoose.models.Task || mongoose.model('Task', taskSchema);

function serialize(doc) {
  if (!doc) return null;
  return {
    task_id: String(doc._id),
    user_id: String(doc.userId),
    title: doc.title,
    status: doc.status,
    priority: doc.priority,
    due_date: doc.dueDate || null,
    created_at: dateTimeString(doc.createdAt),
  };
}

async function listByUser(userId, filter) {
  const query = { userId };
  if (filter === 'pending') query.status = 'Pending';
  else if (filter === 'completed') query.status = 'Completed';
  else if (filter === 'overdue') {
    query.status = 'Pending';
    query.dueDate = { $lt: dateKey(new Date()), $ne: null };
  }
  const rows = await Task.find(query).sort({ _id: -1 }).lean();
  return rows.map(serialize);
}

async function findById(taskId, userId) {
  if (!isValidId(taskId) || !isValidId(userId)) return null;
  const doc = await Task.findOne({ _id: taskId, userId }).lean();
  return serialize(doc);
}

async function create(userId, { title, priority, dueDate }) {
  const doc = await Task.create({
    userId,
    title,
    priority,
    dueDate: dueDate || null,
  });
  return serialize(doc);
}

async function update(taskId, userId, changes) {
  if (!isValidId(taskId) || !isValidId(userId)) return null;
  const $set = {};
  if ('title' in changes) $set.title = changes.title;
  if ('priority' in changes) $set.priority = changes.priority;
  if ('status' in changes) $set.status = changes.status;
  if ('dueDate' in changes) $set.dueDate = changes.dueDate || null;
  if (!Object.keys($set).length) return findById(taskId, userId);
  const doc = await Task.findOneAndUpdate({ _id: taskId, userId }, { $set }, { new: true }).lean();
  return serialize(doc);
}

async function remove(taskId, userId) {
  if (!isValidId(taskId) || !isValidId(userId)) return;
  await Task.deleteOne({ _id: taskId, userId });
}

async function countCompleted(userId) {
  return Task.countDocuments({ userId, status: 'Completed' });
}

module.exports = { listByUser, findById, create, update, remove, countCompleted };
