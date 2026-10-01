const router = require('express').Router();
const ctrl = require('../controllers/lookupController');
const { lookupLimiter } = require('../middleware/rate-limit');

// PUBLIC — no login. The tracking code itself is the only key; each code
// resolves to exactly one student/employee record, never a list.
router.get('/student/:code', lookupLimiter, ctrl.lookupStudent);
router.get('/employee/:code', lookupLimiter, ctrl.lookupEmployee);

module.exports = router;
