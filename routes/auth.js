const express = require('express');
const bcrypt = require('bcryptjs');
const users = require('../models/userModel');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

router.post('/register', async (req, res) => {
  try {
    const fullName = (req.body.fullName || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    if (!fullName || fullName.length > 100) {
      return res.status(400).json({ error: 'Please enter your name (max 100 characters).' });
    }
    if (!EMAIL_RE.test(email) || email.length > 150) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Use a password with at least 8 characters.' });
    }
    const existing = await users.findByEmail(email);
    if (existing) {
      return res
        .status(409)
        .json({ error: 'An account with this email already exists. Try signing in instead.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await users.create(fullName, email, hash);
    req.session.userId = user.user_id;
    res.status(201).json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Could not create the account. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const user = await users.findByEmail(email);
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    req.session.userId = user.user_id;
    const safeUser = await users.findById(user.user_id);
    res.json({ user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Sign in unavailable. Please try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await users.findById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user });
});

module.exports = router;
