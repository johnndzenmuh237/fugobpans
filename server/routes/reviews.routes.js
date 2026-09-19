const router = require('express').Router();
const ctrl = require('../controllers/reviewController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles } = require('../middleware/roles');
const { publicWriteLimiter } = require('../middleware/rate-limit');

// PUBLIC — submitting a review needs no account; rate-limited against spam/abuse.
router.post('/', publicWriteLimiter, ctrl.submit);
router.get('/', ctrl.listPublic); // only ever returns APPROVED reviews

// MANAGER moderation
router.get('/all', requireAuth, allowRoles(ROLES.MANAGER), ctrl.listAll);
router.patch('/:id/moderate', requireAuth, allowRoles(ROLES.MANAGER), ctrl.moderate);
router.patch('/:id', requireAuth, allowRoles(ROLES.MANAGER), ctrl.edit);
router.delete('/:id', requireAuth, allowRoles(ROLES.MANAGER), ctrl.remove);

module.exports = router;
