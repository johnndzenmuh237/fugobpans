const router = require('express').Router();
const ctrl = require('../controllers/ownerController');
const { requireAuth } = require('../middleware/auth');
const dash = require('../controllers/ownerDashboardController');
const { allowOwner } = require('../middleware/roles');

// Every route here is Owner-only. Principals and administrators get 403.
router.use(requireAuth, allowOwner);

router.get('/overview', dash.overview);
router.get('/records/:type', dash.records);
router.get('/management', ctrl.list);
router.post('/management', ctrl.create);
router.patch('/management/:id', ctrl.update);
router.post('/management/:id/reset-password', ctrl.resetPassword);
router.post('/management/:id/deactivate', ctrl.deactivate);
router.post('/management/:id/reactivate', ctrl.reactivate);
router.post('/management/:id/replace', ctrl.replace);
router.get('/management/:id/history', ctrl.history);

module.exports = router;
