const router = require('express').Router();
const ctrl = require('../controllers/recoveryController');
const { otpLimiter } = require('../middleware/rate-limit');

// PUBLIC (rate limited). Mounted at /api/recovery
router.post('/request', otpLimiter, ctrl.request);
router.post('/verify', otpLimiter, ctrl.verify);
module.exports = router;
