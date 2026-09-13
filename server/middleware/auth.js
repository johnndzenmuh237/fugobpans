const { verifyToken } = require('../services/authService');
const { query } = require('../config/db');

/**
 * Reads the JWT from the httpOnly `session` cookie (never from
 * localStorage — this avoids exposing the token to XSS). Verifies it,
 * then re-fetches the user's CURRENT role/status from the database on
 * every request — so a suspended account or role change takes effect
 * immediately, not only after the token naturally expires.
 */
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.session;
    if (!token) return res.status(401).json({ error: 'Not logged in.' });

    const decoded = verifyToken(token);
    const { rows } = await query('SELECT id, name, email, role, status, linked_employee_id, linked_student_id FROM users WHERE id = $1', [decoded.uid]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
    if (user.status === 'SUSPENDED') return res.status(403).json({ error: 'This account has been suspended.' });

    req.user = {
      uid: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      linkedEmployeeId: user.linked_employee_id,
      linkedStudentId: user.linked_student_id,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

module.exports = { requireAuth };
