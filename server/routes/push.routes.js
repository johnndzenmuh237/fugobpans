const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/error-handler');
const { query } = require('../config/db');
const push = require('../services/pushService');

const B64U = /^[A-Za-z0-9_-]+$/;

// Public key is not secret, but only signed-in people need it.
router.get('/status', requireAuth, asyncHandler(async (req, res) => {
  const prefs = (await query('SELECT push_enabled, push_messages, push_updates FROM notification_preferences WHERE user_id = $1', [req.user.uid])).rows[0]
    || { push_enabled: true, push_messages: true, push_updates: true };
  const devices = (await query('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [req.user.uid])).rows[0].n;
  res.json({ configured: push.isConfigured(), publicKey: push.publicKey(), devices, preferences: prefs });
}));

router.post('/subscribe', requireAuth, asyncHandler(async (req, res) => {
  if (!push.isConfigured()) throw new AppError('Push notifications are not set up on the server yet.', 503);
  const { endpoint, keys } = req.body.subscription || req.body || {};
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !/^https:\/\//.test(endpoint)) throw new AppError('Invalid subscription.');
  if (!keys || !B64U.test(keys.p256dh || '') || !B64U.test(keys.auth || '') || Buffer.from(keys.p256dh, 'base64url').length !== 65 || Buffer.from(keys.auth, 'base64url').length !== 16) throw new AppError('Invalid subscription keys.');
  // A shared phone: the same browser endpoint moves to whoever is signed in now.
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent, failures = 0`,
    [req.user.uid, endpoint, keys.p256dh, keys.auth, String(req.get('user-agent') || '').slice(0, 300)]);
  // Keep at most 10 devices per person (oldest dropped).
  await query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND id NOT IN (SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10)`, [req.user.uid]);
  await query('INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [req.user.uid]);
  res.status(201).json({ ok: true });
}));

router.post('/unsubscribe', requireAuth, asyncHandler(async (req, res) => {
  const endpoint = String(req.body.endpoint || '');
  if (endpoint) await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.uid]);
  else await query('DELETE FROM push_subscriptions WHERE user_id = $1', [req.user.uid]);
  res.json({ ok: true });
}));

router.put('/preferences', requireAuth, asyncHandler(async (req, res) => {
  const b = (v, d) => (typeof v === 'boolean' ? v : d);
  const { rows } = await query(
    `INSERT INTO notification_preferences (user_id, push_enabled, push_messages, push_updates) VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET push_enabled = $2, push_messages = $3, push_updates = $4, updated_at = now()
     RETURNING push_enabled, push_messages, push_updates`,
    [req.user.uid, b(req.body.push_enabled, true), b(req.body.push_messages, true), b(req.body.push_updates, true)]);
  res.json(rows[0]);
}));

router.post('/test', requireAuth, asyncHandler(async (req, res) => {
  if (!push.isConfigured()) throw new AppError('Push notifications are not set up on the server yet.', 503);
  const r = await push.pushToUsers([req.user.uid], { title: 'Notifications are working', body: 'You will see school messages here even when the app is closed.', url: '/', tag: 'test', kind: 'message' });
  res.json(r);
}));

module.exports = router;
