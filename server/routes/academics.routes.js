const router = require('express').Router();
const { academicsController: ctrl } = require('../controllers/schoolController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles } = require('../middleware/roles');

// Public reads — powers the public website's class/category selection (spec §6)
router.get('/categories', ctrl.listCategories);
router.post('/categories', requireAuth, allowRoles(ROLES.MANAGER), ctrl.createCategory);
router.get('/classes', ctrl.listClasses);
router.post('/classes', requireAuth, allowRoles(ROLES.MANAGER), ctrl.createClass);
router.patch('/classes/:id/teacher', requireAuth, allowRoles(ROLES.MANAGER), ctrl.assignClassTeacher);
router.get('/subjects', ctrl.listSubjects);
router.post('/subjects', requireAuth, allowRoles(ROLES.MANAGER), ctrl.createSubject);
router.post('/classes/:id/subjects', requireAuth, allowRoles(ROLES.MANAGER), ctrl.assignSubjectTeacher);
router.get('/fee-structures', ctrl.listFeeStructures);
router.post('/fee-structures', requireAuth, allowRoles(ROLES.MANAGER), ctrl.createFeeStructure);
router.get('/sessions', ctrl.listSessions);
router.post('/sessions', requireAuth, allowRoles(ROLES.MANAGER), ctrl.createSession);

module.exports = router;
