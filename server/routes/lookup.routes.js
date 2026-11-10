const router = require('express').Router();
const ctrl = require('../controllers/lookupController');
const recovery = require('../controllers/recoveryController');
const { lookupLimiter, otpLimiter } = require('../middleware/rate-limit');

// PUBLIC — no login. The tracking code itself is the only key; each code
// resolves to exactly one student/employee record, never a list.
// If the Owner switches on "verify before showing records" (Fee Reminders > Settings), the student route
// additionally requires the one-time code sent to the guardian's phone (see /otp/request and /otp/verify).
router.post('/student-otp/request', otpLimiter, recovery.lookupRequest);
router.post('/student-otp/verify', otpLimiter, recovery.lookupVerify);
router.get('/student/:code', lookupLimiter, ctrl.gateStudentLookup, ctrl.lookupStudent);
router.get('/employee/:code', lookupLimiter, ctrl.lookupEmployee);

module.exports = router;
