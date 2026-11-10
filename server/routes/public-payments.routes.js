const router = require('express').Router();
const ctrl = require('../controllers/verificationController');
const { publicWriteLimiter } = require('../middleware/rate-limit');

// PUBLIC — a parent/student submits Mobile Money evidence. Creates a PENDING payment only; never credits the invoice.
router.post('/submit', publicWriteLimiter, ctrl.submitPublic);

module.exports = router;
