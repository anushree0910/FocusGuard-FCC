const mongoose = require('mongoose');
const { dateTimeString, dateKey } = require('./helpers');

const journalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, maxlength: 150 },
  notes: { type: String, default: '' },
  entryDate: { type: Date, default: Date.now },
});

const JournalEntry = mongoose.models.JournalEntry || mongoose.model('JournalEntry', journalSchema);

function serialize(doc) {
  if (!doc) return null;
  return {
    entry_id: String(doc._id),
    user_id: String(doc.userId),
    title: doc.title,
    notes: doc.notes,
    entry_date: dateTimeString(doc.entryDate),
  };
}

async function listByUser(userId, q) {
  const rows = await JournalEntry.find({ userId }).sort({ entryDate: -1 }).lean();
  let list = rows.map(serialize);
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter((entry) => {
      const date = dateKey(entry.entry_date) || '';
      return (
        entry.title.toLowerCase().includes(needle) ||
        (entry.notes || '').toLowerCase().includes(needle) ||
        date.includes(needle) ||
        (entry.entry_date || '').toLowerCase().includes(needle)
      );
    });
  }
  return list;
}

async function create(userId, { title, notes }) {
  const doc = await JournalEntry.create({
    userId,
    title,
    notes: notes || '',
    entryDate: new Date(),
  });
  return serialize(doc);
}

module.exports = { listByUser, create };
