const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { verifyPassword, signToken, hashPassword } = require('../services/authService');
const { writeAudit } = require('../utils/auditLogger');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 12 * 60 * 60 * 1000,
};

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new AppError('Email and password are required.');

  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new AppError('Invalid email or password.', 401);
  }
  if (user.status === 'SUSPENDED') throw new AppError('This account has been suspended.', 403);

  const token = signToken({ uid: user.id, role: user.role });
  res.cookie('session', token, COOKIE_OPTS);
  await writeAudit({ user: { uid: user.id, name: user.name, role: user.role }, action: 'LOGIN', entity: 'users', entityId: user.id, req });

  res.json({ uid: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.must_change_password });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

const me = asyncHandler(async (req, res) => {
  res.json(req.user);
});

/** MANAGER only — create internal logins (Manager/Accountant, or a Teacher/Employee login tied to an existing employee record). */
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, linkedEmployeeId } = req.body;
  if (!name || !email || !password || !role) throw new AppError('name, email, password and role are required.');
  const hash = await hashPassword(password);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role, linked_employee_id) VALUES ($1,$2,$3,$4,$5)
     RETURNING id, name, email, role`,
    [name, email, hash, role, linkedEmployeeId || null]
  );
  await writeAudit({ user: req.user, action: 'CREATE_USER', entity: 'users', entityId: rows[0].id, after: { email, role }, req });
  res.status(201).json(rows[0]);
});

const changePassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) throw new AppError('New password must be at least 8 characters.');
  const hash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hash, req.user.uid]);
  res.json({ ok: true });
});

module.exports = { login, logout, me, createUser, changePassword };
