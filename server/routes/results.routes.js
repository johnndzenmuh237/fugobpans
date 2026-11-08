const router = require('express').Router();
const { resultsController: ctrl } = require('../controllers/schoolController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, needs } = require('../middleware/roles');

// Teacher results-entry (new feature)
router.get('/my-classes', requireAuth, allowRoles(ROLES.TEACHER), ctrl.myClasses);
router.get('/my-subjects', requireAuth, allowRoles(ROLES.TEACHER), ctrl.mySubjects);
router.get('/sheet', requireAuth, allowRoles(ROLES.TEACHER, ROLES.MANAGER), needs('academics'), ctrl.sheet);
router.get('/pending', requireAuth, allowRoles(ROLES.MANAGER), needs('academics'), ctrl.pending);
router.post('/review', requireAuth, allowRoles(ROLES.MANAGER), needs('academics'), ctrl.review);
router.post('/', requireAuth, allowRoles(ROLES.TEACHER, ROLES.MANAGER), needs('academics'), ctrl.save);

// Viewing a specific student's results — Manager, the student themself (checked
// against linkedStudentId at the controller/route level below), or a teacher.
router.get('/student/:studentId', requireAuth, allowRoles(ROLES.MANAGER, ROLES.TEACHER), ctrl.forStudent);

module.exports = router;
