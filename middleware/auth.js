const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'atlas-dev-secret-change-in-prod';

module.exports = function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.coach = jwt.verify(auth.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};
