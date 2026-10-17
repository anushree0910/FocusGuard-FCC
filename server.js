const path = require('path');
const express = require('express');
const session = require('express-session');
const { connect } = require('./models/db');
const requireAuth = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const sessionRoutes = require('./routes/sessions');
const journalRoutes = require('./routes/journal');
const exportRoutes = require('./routes/export');
const profileRoutes = require('./routes/profile');
const analyticsRoutes = require('./routes/analytics');

const app = express();

app.use(express.json());
app.use(
  session({
    secret: 'focusguard-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api/sessions', requireAuth, sessionRoutes);
app.use('/api/journal', requireAuth, journalRoutes);
app.use('/api/export', requireAuth, exportRoutes);
app.use('/api/profile', requireAuth, profileRoutes);
app.use('/api/analytics', requireAuth, analyticsRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const PORT = process.env.PORT || 3000;

connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`FocusGuard running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB at mongodb://127.0.0.1:27017/focusguard_web');
    console.error(err.message);
    console.error('Start MongoDB locally, then run npm start again.');
    process.exit(1);
  });
