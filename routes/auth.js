const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { randomUUID } = require('crypto');

const SECRET = process.env.JWT_SECRET || 'atlas-dev-secret-change-in-prod';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères min)' });

  try {
    const existing = db.prepare('SELECT id FROM coaches WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email déjà utilisé' });

    const hash = await bcrypt.hash(password, 12);
    const id = randomUUID();
    db.prepare('INSERT INTO coaches (id, name, email, password) VALUES (?, ?, ?, ?)').run(id, name, email, hash);

    const token = jwt.sign({ id, name, email }, SECRET, { expiresIn: '30d' });
    res.json({ token, coach: { id, name, email } });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  try {
    const coach = db.prepare('SELECT * FROM coaches WHERE email = ?').get(email);
    if (!coach) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const ok = await bcrypt.compare(password, coach.password);
    if (!ok) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

    const token = jwt.sign({ id: coach.id, name: coach.name, email: coach.email }, SECRET, { expiresIn: '30d' });
    res.json({ token, coach: { id: coach.id, name: coach.name, email: coach.email } });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/auth/me — vérifie le token
router.get('/me', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = jwt.verify(auth.slice(7), SECRET);
    const coach = db.prepare('SELECT id, name, email FROM coaches WHERE id = ?').get(payload.id);
    if (!coach) return res.status(401).json({ error: 'Coach introuvable' });
    res.json({ coach });
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
});

module.exports = router;
