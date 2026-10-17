const express = require('express');
const sessions = require('../models/sessionModel');

const router = express.Router();

function csvCell(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function hhmmss(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

router.get('/sessions', async (req, res) => {
  const rows = await sessions.allForExport(req.session.userId);
  const header = 'Session ID,Mode,Technique,Started,Ended,Planned Minutes,Elapsed,Status';
  const lines = rows.map((r) =>
    [
      r.session_id,
      r.mode,
      r.technique,
      r.start_time || '',
      r.end_time || '',
      r.duration_minutes,
      hhmmss(r.elapsed_seconds),
      r.status,
    ]
      .map(csvCell)
      .join(',')
  );
  const csv = [header, ...lines].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="focusguard-sessions.csv"');
  res.send(csv);
});

module.exports = router;
