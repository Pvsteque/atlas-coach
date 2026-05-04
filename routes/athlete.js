const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { randomUUID } = require('crypto');

const SECRET = process.env.JWT_SECRET || 'atlas-dev-secret-change-in-prod';

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAthlete(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = jwt.verify(auth.slice(7), SECRET);
    if (payload.type !== 'athlete') return res.status(401).json({ error: 'Token invalide' });
    req.athleteId = payload.athleteId;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// POST /api/athlete/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  const athlete = db.prepare('SELECT * FROM athletes WHERE email = ?').get(email.toLowerCase().trim());
  if (!athlete || !athlete.password) return res.status(401).json({ error: 'Identifiants invalides' });
  const ok = await bcrypt.compare(password, athlete.password);
  if (!ok) return res.status(401).json({ error: 'Identifiants invalides' });
  const token = jwt.sign({ athleteId: athlete.id, type: 'athlete' }, SECRET, { expiresIn: '30d' });
  res.json({ token, athlete: mapAthlete(athlete) });
});

// GET /api/athlete/me
router.get('/me', requireAthlete, (req, res) => {
  const a = db.prepare('SELECT * FROM athletes WHERE id = ?').get(req.athleteId);
  if (!a) return res.status(404).json({ error: 'Adhérent introuvable' });
  res.json({ athlete: mapAthlete(a) });
});

// GET /api/athlete/assignments
router.get('/assignments', requireAthlete, (req, res) => {
  const rows = db.prepare('SELECT * FROM assignments WHERE athlete_id = ? ORDER BY created_at DESC').all(req.athleteId);
  res.json(rows.map(r => ({
    id: r.id, sessionId: r.session_id, sessionName: r.session_name,
    scheduledFor: r.scheduled_for, status: r.status, assignedAt: r.created_at * 1000,
  })));
});

// GET /api/athlete/sessions/:id
router.get('/sessions/:id', requireAthlete, (req, res) => {
  const athlete = db.prepare('SELECT coach_id FROM athletes WHERE id = ?').get(req.athleteId);
  if (!athlete) return res.status(404).json({ error: 'Adhérent introuvable' });
  const s = db.prepare('SELECT * FROM coach_sessions WHERE id = ? AND coach_id = ?').get(req.params.id, athlete.coach_id);
  if (!s) return res.status(404).json({ error: 'Séance introuvable' });
  res.json({ id: s.id, name: s.name, exercises: JSON.parse(s.exercises), tags: s.tags });
});

// GET /api/athlete/logs
router.get('/logs', requireAthlete, (req, res) => {
  const rows = db.prepare('SELECT * FROM logs WHERE athlete_id = ? ORDER BY created_at DESC').all(req.athleteId);
  res.json(rows.map(r => ({
    id: r.id, sessionId: r.session_id, assignId: r.assign_id,
    date: r.date, rpe: r.rpe, mood: r.mood, notes: r.notes,
  })));
});

// POST /api/athlete/logs
router.post('/logs', requireAthlete, (req, res) => {
  const { sessionId, assignId, date, rpe, mood, notes } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId requis' });
  const athlete = db.prepare('SELECT coach_id FROM athletes WHERE id = ?').get(req.athleteId);
  if (!athlete) return res.status(404).json({ error: 'Adhérent introuvable' });
  const id = randomUUID();
  db.prepare('INSERT INTO logs (id, coach_id, athlete_id, session_id, assign_id, date, rpe, mood, notes, seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)')
    .run(id, athlete.coach_id, req.athleteId, sessionId, assignId || null,
      date || new Date().toISOString(), rpe || null, mood || null, notes || '');
  if (assignId) db.prepare("UPDATE assignments SET status='done' WHERE id=?").run(assignId);
  res.status(201).json({ ok: true, id });
});

// GET /api/athlete/nutri
router.get('/nutri', requireAthlete, (req, res) => {
  const plan = db.prepare('SELECT * FROM nutri_plans WHERE athlete_id = ?').get(req.athleteId);
  if (!plan) return res.json(null);
  res.json({ prot: plan.prot, carb: plan.carb, fat: plan.fat });
});

function mapAthlete(r) {
  return {
    id: r.id, name: r.name, age: r.age, weight: r.weight, height: r.height,
    bf: r.bf, color: r.color, obj: r.obj, level: r.level, sport: r.sport, email: r.email,
  };
}

module.exports = router;
