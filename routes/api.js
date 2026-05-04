const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const requireAuth = require('../middleware/auth');
const { randomUUID } = require('crypto');

router.use(requireAuth);

// ── ATHLETES ──────────────────────────────────────────────────────
router.get('/athletes', (req, res) => {
  const rows = db.prepare('SELECT * FROM athletes WHERE coach_id = ? ORDER BY created_at ASC').all(req.coach.id);
  res.json(rows.map(mapAthlete));
});

router.post('/athletes', (req, res) => {
  const { name, age, weight, height, bf, color, obj, level, sport, notes, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const id = randomUUID();
  db.prepare('INSERT INTO athletes (id, coach_id, name, age, weight, height, bf, color, obj, level, sport, notes, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.coach.id, name, age || null, weight || null, height || null, bf || null, color || '#ff7a00', obj || '', level || '', sport || '', notes || '', email ? email.toLowerCase().trim() : null);
  res.status(201).json(mapAthlete(db.prepare('SELECT * FROM athletes WHERE id = ?').get(id)));
});

router.put('/athletes/:id', (req, res) => {
  const a = db.prepare('SELECT id FROM athletes WHERE id = ? AND coach_id = ?').get(req.params.id, req.coach.id);
  if (!a) return res.status(404).json({ error: 'Athlète introuvable' });
  const { name, age, weight, height, bf, color, obj, level, sport, notes } = req.body;
  db.prepare('UPDATE athletes SET name=?, age=?, weight=?, height=?, bf=?, color=?, obj=?, level=?, sport=?, notes=? WHERE id=?')
    .run(name, age || null, weight || null, height || null, bf || null, color, obj, level, sport, notes, req.params.id);
  res.json(mapAthlete(db.prepare('SELECT * FROM athletes WHERE id = ?').get(req.params.id)));
});

router.delete('/athletes/:id', (req, res) => {
  const a = db.prepare('SELECT id FROM athletes WHERE id = ? AND coach_id = ?').get(req.params.id, req.coach.id);
  if (!a) return res.status(404).json({ error: 'Athlète introuvable' });
  db.prepare('DELETE FROM athletes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// PUT /athletes/:id/access — coach sets athlete portal email + password
router.put('/athletes/:id/access', async (req, res) => {
  const a = db.prepare('SELECT id FROM athletes WHERE id = ? AND coach_id = ?').get(req.params.id, req.coach.id);
  if (!a) return res.status(404).json({ error: 'Athlète introuvable' });
  const { email, password } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });
  const existing = db.prepare('SELECT id FROM athletes WHERE email = ? AND id != ?').get(email.toLowerCase().trim(), req.params.id);
  if (existing) return res.status(409).json({ error: 'Email déjà utilisé' });
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 min)' });
    const hash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE athletes SET email=?, password=? WHERE id=?').run(email.toLowerCase().trim(), hash, req.params.id);
  } else {
    db.prepare('UPDATE athletes SET email=? WHERE id=?').run(email.toLowerCase().trim(), req.params.id);
  }
  res.json({ ok: true });
});

function mapAthlete(r) {
  return { id: r.id, name: r.name, age: r.age, weight: r.weight, height: r.height, bf: r.bf, color: r.color, obj: r.obj, level: r.level, sport: r.sport, notes: r.notes, email: r.email, hasPortal: !!(r.email && r.password), createdAt: r.created_at * 1000 };
}

// ── SESSIONS ──────────────────────────────────────────────────────
router.get('/sessions', (req, res) => {
  const rows = db.prepare('SELECT * FROM coach_sessions WHERE coach_id = ? ORDER BY created_at ASC').all(req.coach.id);
  res.json(rows.map(mapSession));
});

router.post('/sessions', (req, res) => {
  const { name, exercises, tags } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  const id = randomUUID();
  db.prepare('INSERT INTO coach_sessions (id, coach_id, name, exercises, tags) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.coach.id, name, JSON.stringify(exercises || []), tags || '');
  res.status(201).json(mapSession(db.prepare('SELECT * FROM coach_sessions WHERE id = ?').get(id)));
});

router.put('/sessions/:id', (req, res) => {
  const s = db.prepare('SELECT id FROM coach_sessions WHERE id = ? AND coach_id = ?').get(req.params.id, req.coach.id);
  if (!s) return res.status(404).json({ error: 'Séance introuvable' });
  const { name, exercises, tags } = req.body;
  db.prepare('UPDATE coach_sessions SET name=?, exercises=?, tags=? WHERE id=?')
    .run(name, JSON.stringify(exercises || []), tags || '', req.params.id);
  res.json(mapSession(db.prepare('SELECT * FROM coach_sessions WHERE id = ?').get(req.params.id)));
});

router.delete('/sessions/:id', (req, res) => {
  const s = db.prepare('SELECT id FROM coach_sessions WHERE id = ? AND coach_id = ?').get(req.params.id, req.coach.id);
  if (!s) return res.status(404).json({ error: 'Séance introuvable' });
  db.prepare('DELETE FROM coach_sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function mapSession(r) {
  return { id: r.id, name: r.name, exercises: JSON.parse(r.exercises), tags: r.tags, createdAt: r.created_at * 1000 };
}

// ── ASSIGNMENTS ───────────────────────────────────────────────────
router.get('/assignments', (req, res) => {
  const rows = db.prepare('SELECT * FROM assignments WHERE coach_id = ? ORDER BY created_at ASC').all(req.coach.id);
  res.json(rows.map(mapAssignment));
});

router.post('/assignments', (req, res) => {
  const { athleteId, sessionId, sessionName, athleteName, scheduledFor, status } = req.body;
  if (!athleteId || !sessionId) return res.status(400).json({ error: 'athleteId et sessionId requis' });
  const id = randomUUID();
  db.prepare('INSERT INTO assignments (id, coach_id, athlete_id, session_id, session_name, athlete_name, scheduled_for, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.coach.id, athleteId, sessionId, sessionName || '', athleteName || '', scheduledFor || null, status || 'assigned');
  res.status(201).json(mapAssignment(db.prepare('SELECT * FROM assignments WHERE id = ?').get(id)));
});

router.put('/assignments/:id', (req, res) => {
  const a = db.prepare('SELECT id FROM assignments WHERE id = ? AND coach_id = ?').get(req.params.id, req.coach.id);
  if (!a) return res.status(404).json({ error: 'Assignment introuvable' });
  const { status } = req.body;
  db.prepare('UPDATE assignments SET status=? WHERE id=?').run(status, req.params.id);
  res.json(mapAssignment(db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id)));
});

router.delete('/assignments/:id', (req, res) => {
  const a = db.prepare('SELECT id FROM assignments WHERE id = ? AND coach_id = ?').get(req.params.id, req.coach.id);
  if (!a) return res.status(404).json({ error: 'Assignment introuvable' });
  db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function mapAssignment(r) {
  return { id: r.id, athleteId: r.athlete_id, sessionId: r.session_id, sessionName: r.session_name, athleteName: r.athlete_name, scheduledFor: r.scheduled_for, status: r.status, assignedAt: r.created_at * 1000 };
}

// ── LOGS ──────────────────────────────────────────────────────────
router.get('/logs', (req, res) => {
  const rows = db.prepare('SELECT * FROM logs WHERE coach_id = ? ORDER BY created_at ASC').all(req.coach.id);
  res.json(rows.map(mapLog));
});

router.post('/logs', (req, res) => {
  const { athleteId, sessionId, assignId, date, rpe, mood, notes } = req.body;
  if (!athleteId || !sessionId) return res.status(400).json({ error: 'athleteId et sessionId requis' });
  const id = randomUUID();
  db.prepare('INSERT INTO logs (id, coach_id, athlete_id, session_id, assign_id, date, rpe, mood, notes, seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
    .run(id, req.coach.id, athleteId, sessionId, assignId || null, date || new Date().toISOString(), rpe || null, mood || null, notes || '');
  res.status(201).json(mapLog(db.prepare('SELECT * FROM logs WHERE id = ?').get(id)));
});

router.post('/logs/mark-seen', (req, res) => {
  db.prepare('UPDATE logs SET seen=1 WHERE coach_id=? AND seen=0').run(req.coach.id);
  res.json({ ok: true });
});

router.put('/logs/:id', (req, res) => {
  const l = db.prepare('SELECT id FROM logs WHERE id = ? AND coach_id = ?').get(req.params.id, req.coach.id);
  if (!l) return res.status(404).json({ error: 'Log introuvable' });
  const { seen } = req.body;
  db.prepare('UPDATE logs SET seen=? WHERE id=?').run(seen ? 1 : 0, req.params.id);
  res.json(mapLog(db.prepare('SELECT * FROM logs WHERE id = ?').get(req.params.id)));
});

router.delete('/logs/:id', (req, res) => {
  const l = db.prepare('SELECT id FROM logs WHERE id = ? AND coach_id = ?').get(req.params.id, req.coach.id);
  if (!l) return res.status(404).json({ error: 'Log introuvable' });
  db.prepare('DELETE FROM logs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function mapLog(r) {
  return { id: r.id, athleteId: r.athlete_id, sessionId: r.session_id, assignId: r.assign_id, date: r.date, rpe: r.rpe, mood: r.mood, notes: r.notes, seen: !!r.seen };
}

// ── NUTRITION ─────────────────────────────────────────────────────
router.get('/nutri', (req, res) => {
  const rows = db.prepare('SELECT * FROM nutri_plans WHERE coach_id = ?').all(req.coach.id);
  const plans = {};
  rows.forEach(r => { plans[r.athlete_id] = { prot: r.prot, carb: r.carb, fat: r.fat }; });
  res.json(plans);
});

router.put('/nutri/:athleteId', (req, res) => {
  const { prot, carb, fat } = req.body;
  const id = randomUUID();
  db.prepare(`
    INSERT INTO nutri_plans (id, coach_id, athlete_id, prot, carb, fat) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(athlete_id) DO UPDATE SET prot=excluded.prot, carb=excluded.carb, fat=excluded.fat, coach_id=excluded.coach_id
  `).run(id, req.coach.id, req.params.athleteId, prot || 0, carb || 0, fat || 0);
  res.json({ ok: true });
});

module.exports = router;
