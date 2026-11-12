const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/conversationsController');
const { requireAuth } = require('../middleware/auth');

// Per-account (not per-IP) throttle on writes, so one account cannot flood management.
const writeLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `u:${req.user?.uid || 'anon'}`,
  message: { error: 'You are sending messages too quickly. Please wait a few minutes.' } });

router.get('/mine', requireAuth, ctrl.mine);
router.get('/inbox', requireAuth, ctrl.inbox);
router.get('/unread-count', requireAuth, ctrl.unreadCounts);
router.post('/', requireAuth, writeLimiter, ctrl.create);
router.get('/:id', requireAuth, ctrl.get);
router.post('/:id/messages', requireAuth, writeLimiter, ctrl.reply);
router.patch('/:id/status', requireAuth, ctrl.setStatus);

module.exports = router;
