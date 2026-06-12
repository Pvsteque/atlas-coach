const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/:token.ics', (req, res) => {
  const coach = db.prepare('SELECT id, name FROM coaches WHERE cal_token = ?').get(req.params.token);
  if (!coach) return res.status(404).send('Calendrier introuvable');

  const rows = db.prepare(
    `SELECT id, session_name, athlete_name, scheduled_for, status
     FROM assignments
     WHERE coach_id = ? AND scheduled_for IS NOT NULL AND scheduled_for != ''
     ORDER BY scheduled_for ASC`
  ).all(coach.id);

  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const events = rows.map(a => {
    const dateStr = a.scheduled_for.substring(0, 10).replace(/-/g, '');
    // DTEND exclusif (RFC 5545) : lendemain de DTSTART pour un événement journée entière
    const end = new Date(a.scheduled_for.substring(0, 10) + 'T00:00:00Z');
    end.setUTCDate(end.getUTCDate() + 1);
    const endStr = end.toISOString().substring(0, 10).replace(/-/g, '');
    const prefix = a.status === 'done' ? '✓ ' : '';
    const summary = escIcs(prefix + (a.session_name || 'Séance') + ' — ' + (a.athlete_name || ''));
    return [
      'BEGIN:VEVENT',
      `UID:${a.id}@atlas-coach`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${endStr}`,
      `SUMMARY:${summary}`,
      `STATUS:${a.status === 'done' ? 'COMPLETED' : 'CONFIRMED'}`,
      'END:VEVENT'
    ].join('\r\n');
  });

  const cal = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Atlas Coach//FR',
    `X-WR-CALNAME:Atlas Coach`,
    'X-WR-TIMEZONE:Europe/Paris',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events,
    'END:VCALENDAR'
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="atlas-coach.ics"');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(cal);
});

function escIcs(s) {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

module.exports = router;
