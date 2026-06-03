const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'atlas-dev-secret-change-in-prod';

module.exports = function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = jwt.verify(auth.slice(7), SECRET);
    const { db } = require('../db');
    const coach = db.prepare('SELECT id, name, email, coach_code FROM coaches WHERE id = ?').get(payload.id);
    if (!coach) return res.status(401).json({ error: 'Session expirée — reconnectez-vous' });
    req.coach = coach;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};
