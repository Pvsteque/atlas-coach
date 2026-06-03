const express = require('express');
const router = express.Router();
const { db } = require('../db');
const requireAuth = require('../middleware/auth');

function requireAuthOrEmptyDB(req, res, next) {
  const isEmpty = db.prepare('SELECT COUNT(*) as n FROM coaches').get().n === 0;
  if (isEmpty) return next();
  requireAuth(req, res, next);
}

router.get('/export', requireAuth, (req, res) => {
  const data = {
    exported_at: new Date().toISOString(),
    coaches: db.prepare('SELECT * FROM coaches').all(),
    athletes: db.prepare('SELECT * FROM athletes').all(),
    coach_sessions: db.prepare('SELECT * FROM coach_sessions').all(),
    assignments: db.prepare('SELECT * FROM assignments').all(),
    logs: db.prepare('SELECT * FROM logs').all(),
    nutri_plans: db.prepare('SELECT * FROM nutri_plans').all(),
    messages: db.prepare('SELECT * FROM messages').all(),
  };
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="atlas-backup-${date}.json"`);
  res.json(data);
});

router.post('/import', express.json({ limit: '50mb' }), requireAuthOrEmptyDB, (req, res) => {
  const data = req.body;
  if (!data || !Array.isArray(data.coaches)) return res.status(400).json({ error: 'Format de backup invalide' });

  try {
    db.exec('PRAGMA foreign_keys = OFF');

    db.transaction(() => {
      db.exec('DELETE FROM messages');
      db.exec('DELETE FROM nutri_plans');
      db.exec('DELETE FROM logs');
      db.exec('DELETE FROM assignments');
      db.exec('DELETE FROM coach_sessions');
      db.exec('DELETE FROM athletes');
      db.exec('DELETE FROM coaches');

      const stmts = {
        coach: db.prepare('INSERT OR REPLACE INTO coaches (id, name, email, password, created_at, coach_code) VALUES (?, ?, ?, ?, ?, ?)'),
        athlete: db.prepare('INSERT OR REPLACE INTO athletes (id, coach_id, name, age, weight, height, bf, color, obj, level, sport, notes, created_at, email, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
        session: db.prepare('INSERT OR REPLACE INTO coach_sessions (id, coach_id, name, exercises, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
        assignment: db.prepare('INSERT OR REPLACE INTO assignments (id, coach_id, athlete_id, session_id, session_name, athlete_name, scheduled_for, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
        log: db.prepare('INSERT OR REPLACE INTO logs (id, coach_id, athlete_id, session_id, assign_id, date, rpe, mood, notes, seen, created_at, sets_data, photos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
        nutri: db.prepare('INSERT OR REPLACE INTO nutri_plans (id, coach_id, athlete_id, prot, carb, fat) VALUES (?, ?, ?, ?, ?, ?)'),
        msg: db.prepare('INSERT OR REPLACE INTO messages (id, coach_id, athlete_id, sender, text, ts, read) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      };

      for (const r of data.coaches || []) stmts.coach.run(r.id, r.name, r.email, r.password, r.created_at, r.coach_code);
      for (const r of data.athletes || []) stmts.athlete.run(r.id, r.coach_id, r.name, r.age, r.weight, r.height, r.bf, r.color, r.obj, r.level, r.sport, r.notes, r.created_at, r.email, r.password);
      for (const r of data.coach_sessions || []) stmts.session.run(r.id, r.coach_id, r.name, r.exercises, r.tags, r.created_at);
      for (const r of data.assignments || []) stmts.assignment.run(r.id, r.coach_id, r.athlete_id, r.session_id, r.session_name, r.athlete_name, r.scheduled_for, r.status, r.created_at);
      for (const r of data.logs || []) stmts.log.run(r.id, r.coach_id, r.athlete_id, r.session_id, r.assign_id, r.date, r.rpe, r.mood, r.notes, r.seen, r.created_at, r.sets_data, r.photos);
      for (const r of data.nutri_plans || []) stmts.nutri.run(r.id, r.coach_id, r.athlete_id, r.prot, r.carb, r.fat);
      for (const r of data.messages || []) stmts.msg.run(r.id, r.coach_id, r.athlete_id, r.sender, r.text, r.ts, r.read);
    })();

    db.exec('PRAGMA foreign_keys = ON');
    res.json({
      ok: true,
      athletes: data.athletes?.length ?? 0,
      logs: data.logs?.length ?? 0,
      messages: data.messages?.length ?? 0,
    });
  } catch (err) {
    db.exec('PRAGMA foreign_keys = ON');
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
