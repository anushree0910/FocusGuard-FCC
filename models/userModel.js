const mongoose = require('mongoose');
const { dateTimeString, isValidId } = require('./helpers');

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, maxlength: 150 },
    passwordHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

function publicUser(doc) {
  if (!doc) return null;
  return {
    user_id: String(doc._id),
    fullName: doc.fullName,
    email: doc.email,
    created_at: dateTimeString(doc.createdAt),
  };
}

async function findByEmail(email) {
  const doc = await User.findOne({ email }).lean();
  if (!doc) return null;
  return {
    ...publicUser(doc),
    password_hash: doc.passwordHash,
  };
}

async function findById(id) {
  if (!isValidId(id)) return null;
  const doc = await User.findById(id).lean();
  return publicUser(doc);
}

async function getPasswordHash(id) {
  if (!isValidId(id)) return null;
  const doc = await User.findById(id).select('passwordHash').lean();
  return doc ? doc.passwordHash : null;
}

async function create(fullName, email, passwordHash) {
  const doc = await User.create({ fullName, email, passwordHash });
  return publicUser(doc);
}

async function updateProfile(id, fullName, email) {
  if (!isValidId(id)) return null;
  const doc = await User.findByIdAndUpdate(id, { fullName, email }, { new: true }).lean();
  return publicUser(doc);
}

async function updatePassword(id, passwordHash) {
  if (!isValidId(id)) return;
  await User.findByIdAndUpdate(id, { passwordHash });
}

module.exports = { findByEmail, findById, getPasswordHash, create, updateProfile, updatePassword };
