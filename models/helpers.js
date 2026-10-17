const mongoose = require('mongoose');

function pad(n) {
  return String(n).padStart(2, '0');
}

function asDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function dateKey(value) {
  const d = asDate(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function dateTimeString(value) {
  const d = asDate(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  return dateKey(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function startOfDay(from = new Date()) {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate());
}

function daysAgoStart(days) {
  const d = startOfDay();
  d.setDate(d.getDate() - days);
  return d;
}

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

module.exports = { dateKey, dateTimeString, startOfDay, daysAgoStart, isValidId };
