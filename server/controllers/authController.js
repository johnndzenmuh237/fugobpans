const crypto = require('crypto');
const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { verifyPassword, signToken, hashPassword } = require('../services/authService');
const { writeAudit } = require('../utils/auditLogger');
const { ROLES, MANAGEMENT_ROLES } = require('../middleware/roles');
const { sendMail } = require('../utils/mailer');

const IS_PROD = process.env.NODE_ENV === 'production';
const COOKIE_BASE = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? 'none' : 'lax', // 'none' required for the frontend/API to live on different domains in production
};
// Owner sessions are deliberately short; everyone else keeps the original 12 hours.
const SESSION_HOURS = (role) => (role === ROLES.OWNER ? 2 : 12);
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError('Email and password are required.');

  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  const user = rows[0];

  if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError('Too many failed attempts. Try again in a few minutes.', 429);
  }
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    if (user) {
      await query(
        `UPDATE users SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END
         WHERE id = $1`,
        [user.id, MAX_FAILED, String(LOCK_MINUTES)]
      );
    }
    throw new AppError('Invalid email or password.', 401);
  }
  if (user.status === 'SUSPENDED') throw new AppError('This account has been suspended.', 403);
  if (user.status === 'DEACTIVATED') throw new AppError('This account has been deactivated. Contact the School Owner.', 403);

  await query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);

  const hours = SESSION_HOURS(user.role);
  const token = signToken({ uid: user.id, role: user.role }, `${hours}h`);
  res.cookie('session', token, { ...COOKIE_BASE, maxAge: hours * 60 * 60 * 1000 });
  await writeAudit({ user: { uid: user.id, name: user.name, role: user.role }, action: 'LOGIN', entity: 'users', entityId: user.id, req });

  res.json({ uid: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.must_change_password });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie('session', COOKIE_BASE);
  res.json({ ok: true });
});

const me = asyncHandler(async (req, res) => {
  res.json(req.user);
});

/**
 * Create a login for Accountant / Teacher / Employee / Student / Parent.
 * Management posts (Principal, Vice Principal, Administrator, Academic Admin, Manager)
 * can ONLY be created by the Owner through /api/owner/management, and an OWNER can
 * never be created through the API at all.
 */
const CREATABLE_BY_MANAGEMENT = [ROLES.ACCOUNTANT, ROLES.TEACHER, ROLES.EMPLOYEE, ROLES.STUDENT, ROLES.PARENT];
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, linkedEmployeeId } = req.body;
  if (!name || !email || !password || !role) throw new AppError('name, email, password and role are required.');
  if (String(password).length < 8) throw new AppError('Password must be at least 8 characters.');
  if (!CREATABLE_BY_MANAGEMENT.includes(role)) {
    throw new AppError('That account type can only be created by the School Owner.', 403);
  }
  const hash = await hashPassword(password);
  let rows;
  try {
    ({ rows } = await query(
      `INSERT INTO users (name, email, password_hash, role, linked_employee_id, created_by) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, email, role`,
      [name, email, hash, role, linkedEmployeeId || null, req.user.uid]
    ));
  } catch (e) {
    if (e.code === '23505') throw new AppError('An account with that email already exists.', 409);
    throw e;
  }
  await writeAudit({ user: req.user, action: 'CREATE_USER', entity: 'users', entityId: rows[0].id, after: { email, role }, req });
  res.status(201).json(rows[0]);
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) throw new AppError('New password must be at least 8 characters.');
  const { rows } = await query('SELECT password_hash, must_change_password FROM users WHERE id = $1', [req.user.uid]);
  // A user on a temporary password may skip "current"; otherwise it is required.
  if (!rows[0].must_change_password) {
    if (!currentPassword || !(await verifyPassword(currentPassword, rows[0].password_hash))) {
      throw new AppError('Current password is incorrect.', 403);
    }
  }
  const hash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hash, req.user.uid]);
  await writeAudit({ user: req.user, action: 'CHANGE_PASSWORD', entity: 'users', entityId: req.user.uid, req });
  res.json({ ok: true });
});

/** Always answers the same way, so it cannot be used to discover which emails have accounts. */
const forgotPassword = asyncHandler(async (req, res) => {
  const generic = { ok: true, message: 'If that email has an account, a reset link has been sent.' };
  const { email } = req.body;
  if (!email) return res.json(generic);
  const { rows } = await query("SELECT id, name, status FROM users WHERE lower(email) = lower($1)", [email]);
  const user = rows[0];
  if (!user || user.status !== 'ACTIVE') return res.json(generic);

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await query("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '30 minutes')", [user.id, tokenHash]);

  const origin = (process.env.CLIENT_ORIGIN || '').split(',')[0].trim() || '';
  const link = `${origin}/reset-password.html?token=${token}`;
  const sent = await sendMail({ to: email, subject: 'Reset your school portal password', text: `Hello ${user.name},\n\nUse this link within 30 minutes to set a new password:\n${link}\n\nIf you did not ask for this, ignore this email.` }).catch(() => false);
  if (!sent && !IS_PROD) console.log(`[dev] Email is not configured. Password reset link for ${email}: ${link}`);
  await writeAudit({ user: { uid: user.id, name: user.name, role: null }, action: 'PASSWORD_RESET_REQUESTED', entity: 'users', entityId: user.id, req });
  res.json(generic);
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.length < 8) throw new AppError('A valid token and a password of at least 8 characters are required.');
  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
  const { rows } = await query(
    'SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()', [tokenHash]
  );
  if (!rows[0]) throw new AppError('This reset link is invalid or has expired.', 400);
  const hash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1, must_change_password = false, failed_attempts = 0, locked_until = NULL WHERE id = $2', [hash, rows[0].user_id]);
  await query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [rows[0].user_id]);
  await writeAudit({ user: { uid: rows[0].user_id, name: 'Password reset', role: null }, action: 'PASSWORD_RESET_COMPLETED', entity: 'users', entityId: rows[0].user_id, req });
  res.json({ ok: true });
});

module.exports = { login, logout, me, createUser, changePassword, forgotPassword, resetPassword };
