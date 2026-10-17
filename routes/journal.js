const express = require('express');
const journal = require('../models/journalModel');

const router = express.Router();

router.get('/', async (req, res) => {
  const q = (req.query.q || '').trim();
  const rows = await journal.listByUser(req.session.userId, q);
  res.json({ entries: rows });
});

router.post('/', async (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title || title.length > 150) {
    return res.status(400).json({ error: 'Enter a title (max 150 characters).' });
  }
  const entry = await journal.create(req.session.userId, {
    title,
    notes: (req.body.notes || '').trim(),
  });
  res.status(201).json({ entry });
});

module.exports = router;
