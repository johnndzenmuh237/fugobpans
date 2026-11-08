const router = require('express').Router();
const parent = require('../controllers/parentController');
const msg = require('../controllers/messagesController');
const ax = require('../controllers/academicExtrasController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, needs } = require('../middleware/roles');

// NOTE: requireAuth is applied per route (not router.use) because this router is mounted at /api,
// and a global guard here would lock out the public endpoints registered after it.
const MGMT = (perm) => [allowRoles(ROLES.MANAGER), needs(perm)];

// Parents — management creates/links accounts; parents see only their own children (checked in the controller)
router.post('/parents', requireAuth, ...MGMT('students'), parent.createParent);
router.get('/parents', requireAuth, ...MGMT('students'), parent.listParents);
router.post('/parents/:id/children', requireAuth, ...MGMT('students'), parent.linkChild);
router.delete('/parents/:id/children/:studentId', requireAuth, ...MGMT('students'), parent.unlinkChild);
router.get('/parent/children', requireAuth, allowRoles(ROLES.PARENT), parent.myChildren);
router.get('/parent/children/:id/overview', requireAuth, allowRoles(ROLES.PARENT, ROLES.MANAGER, ROLES.TEACHER), parent.childOverviewHandler);
router.get('/student/me/overview', requireAuth, allowRoles(ROLES.STUDENT), parent.myOverview);

// Messaging
router.get('/messages/contacts', requireAuth, msg.contacts);
router.get('/messages/unread-count', requireAuth, msg.unread);
router.get('/messages', requireAuth, msg.list);
router.post('/messages', requireAuth, msg.send);
router.patch('/messages/:id/read', requireAuth, msg.markRead);

// Terms, timetable, performance, report cards
router.get('/terms', requireAuth, ax.listTerms);
router.post('/terms', requireAuth, ...MGMT('academics'), ax.saveTerm);
router.get('/timetable', requireAuth, allowRoles(ROLES.MANAGER, ROLES.TEACHER), ax.listSlots);
router.get('/timetable/my', requireAuth, allowRoles(ROLES.TEACHER, ROLES.STUDENT), ax.mySlots);
router.post('/timetable', requireAuth, ...MGMT('academics'), ax.addSlot);
router.delete('/timetable/:id', requireAuth, ...MGMT('academics'), ax.deleteSlot);
router.get('/employees/:id/performance', requireAuth, ...MGMT('teachers'), ax.listPerformance);
router.post('/employees/:id/performance', requireAuth, ...MGMT('teachers'), ax.addPerformance);
router.get('/report-card/:studentId', requireAuth, ax.reportCard);
router.get('/report-card/:studentId/pdf', requireAuth, ax.reportCardPdf);

module.exports = router;
