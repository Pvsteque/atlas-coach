const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { randomUUID } = require('crypto');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const VALID_MUSCLES = ['chest','shoulders','biceps','triceps','forearms','abs','quads','calves','hip','back','traps','lower-back','glutes','hamstrings'];

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
    setsData: r.sets_data || null, photos: r.photos || null,
  })));
});

// POST /api/athlete/logs
router.post('/logs', requireAthlete, (req, res) => {
  const { sessionId, assignId, date, rpe, mood, notes, sets_data, photos } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId requis' });
  const athlete = db.prepare('SELECT coach_id FROM athletes WHERE id = ?').get(req.athleteId);
  if (!athlete) return res.status(404).json({ error: 'Adhérent introuvable' });
  const id = randomUUID();
  db.prepare('INSERT INTO logs (id, coach_id, athlete_id, session_id, assign_id, date, rpe, mood, notes, seen, sets_data, photos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)')
    .run(id, athlete.coach_id, req.athleteId, sessionId, assignId || null,
      date || new Date().toISOString(), rpe || null, mood || null, notes || '', sets_data || null, photos || null);
  if (assignId) db.prepare("UPDATE assignments SET status='done' WHERE id=?").run(assignId);
  res.status(201).json({ ok: true, id });
});

// GET /api/athlete/sessions/:id/history — dernier log pour cette séance
router.get('/sessions/:id/history', requireAthlete, (req, res) => {
  const log = db.prepare('SELECT * FROM logs WHERE athlete_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT 1').get(req.athleteId, req.params.id);
  if (!log) return res.json(null);
  res.json({ id: log.id, date: log.date, rpe: log.rpe, mood: log.mood, notes: log.notes, sets_data: log.sets_data });
});

// POST /api/athlete/redo-session — créer un nouvel assignment pour refaire une séance
router.post('/redo-session', requireAthlete, (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId requis' });
  const athlete = db.prepare('SELECT coach_id FROM athletes WHERE id = ?').get(req.athleteId);
  if (!athlete) return res.status(404).json({ error: 'Adhérent introuvable' });
  const session = db.prepare('SELECT * FROM coach_sessions WHERE id = ? AND coach_id = ?').get(sessionId, athlete.coach_id);
  if (!session) return res.status(404).json({ error: 'Séance introuvable' });
  const id = randomUUID();
  db.prepare('INSERT INTO assignments (id, coach_id, athlete_id, session_id, session_name, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, athlete.coach_id, req.athleteId, sessionId, session.name, 'assigned');
  const a = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  res.status(201).json({ id: a.id, sessionId: a.session_id, sessionName: a.session_name, scheduledFor: a.scheduled_for, status: a.status, assignedAt: a.created_at * 1000 });
});

// GET /api/athlete/nutri
router.get('/nutri', requireAthlete, (req, res) => {
  const plan = db.prepare('SELECT * FROM nutri_plans WHERE athlete_id = ?').get(req.athleteId);
  if (!plan) return res.json(null);
  res.json({ prot: plan.prot, carb: plan.carb, fat: plan.fat });
});

// POST /api/athlete/ai/tip — AI exercise guidance
router.post('/ai/tip', requireAthlete, async (req, res) => {
  const { exerciseName } = req.body;
  if (!exerciseName) return res.status(400).json({ error: 'exerciseName requis' });
  if (!anthropic) return res.json(null);

  const athlete = db.prepare('SELECT level, sport, obj FROM athletes WHERE id = ?').get(req.athleteId);
  const profileCtx = athlete
    ? `Niveau: ${athlete.level || 'non spécifié'}, Sport: ${athlete.sport || 'non spécifié'}, Objectif: ${athlete.obj || 'non spécifié'}`
    : '';

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Tu es un coach sportif expert. Pour l'exercice "${exerciseName}", donne:
1. Un conseil technique précis de 2-3 phrases adapté au profil (en français, sans markdown)
2. Les groupes musculaires recrutés parmi cette liste uniquement: ${VALID_MUSCLES.join(', ')}

Profil athlète: ${profileCtx}

Réponds UNIQUEMENT avec du JSON valide (pas de texte avant/après):
{"tip": "...", "muscles": ["muscle1", "muscle2"]}`
      }],
    });

    const text = msg.content[0].text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.json(null);

    const data = JSON.parse(match[0]);
    const muscles = (data.muscles || []).filter(m => VALID_MUSCLES.includes(m));
    res.json({ tip: data.tip || null, muscles: muscles.length ? muscles : null });
  } catch (err) {
    console.error('AI tip error:', err.message);
    res.json(null);
  }
});

// ── MESSAGES ─────────────────────────────────────────────────────────────────
router.get('/messages/unread', requireAthlete, (req, res) => {
  const a = db.prepare('SELECT coach_id FROM athletes WHERE id=?').get(req.athleteId);
  if (!a) return res.status(404).json({ error: 'Athlète introuvable' });
  const row = db.prepare("SELECT COUNT(*) as n FROM messages WHERE coach_id=? AND athlete_id=? AND sender='coach' AND read=0").get(a.coach_id, req.athleteId);
  res.json({ count: row.n });
});

router.get('/messages', requireAthlete, (req, res) => {
  const a = db.prepare('SELECT coach_id FROM athletes WHERE id=?').get(req.athleteId);
  if (!a) return res.status(404).json({ error: 'Athlète introuvable' });
  const msgs = db.prepare('SELECT * FROM messages WHERE coach_id=? AND athlete_id=? ORDER BY ts ASC').all(a.coach_id, req.athleteId);
  res.json(msgs.map(m => ({ id: m.id, sender: m.sender, text: m.text, ts: m.ts * 1000, read: !!m.read })));
});

router.post('/messages', requireAthlete, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Message vide' });
  const a = db.prepare('SELECT coach_id FROM athletes WHERE id=?').get(req.athleteId);
  if (!a) return res.status(404).json({ error: 'Athlète introuvable' });
  const id = randomUUID();
  db.prepare('INSERT INTO messages (id, coach_id, athlete_id, sender, text) VALUES (?,?,?,?,?)').run(id, a.coach_id, req.athleteId, 'athlete', text.trim());
  res.status(201).json({ ok: true, id });
});

router.post('/messages/read', requireAthlete, (req, res) => {
  const a = db.prepare('SELECT coach_id FROM athletes WHERE id=?').get(req.athleteId);
  if (!a) return res.status(404).json({ error: 'Athlète introuvable' });
  db.prepare("UPDATE messages SET read=1 WHERE coach_id=? AND athlete_id=? AND sender='coach'").run(a.coach_id, req.athleteId);
  res.json({ ok: true });
});

function mapAthlete(r) {
  return {
    id: r.id, name: r.name, age: r.age, weight: r.weight, height: r.height,
    bf: r.bf, color: r.color, obj: r.obj, level: r.level, sport: r.sport, email: r.email,
  };
}

module.exports = router;
