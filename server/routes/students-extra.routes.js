const router = require('express').Router();
const c = require('../controllers/studentsExtraController');
const { requireAuth } = require('../middleware/auth');
const { ROLES, allowRoles, needs } = require('../middleware/roles');

const MGMT = [requireAuth, allowRoles(ROLES.MANAGER), needs('students')];

router.patch('/students/:id', ...MGMT, c.updateStudent);
router.post('/students/:id/lifecycle', ...MGMT, c.lifecycle);
router.get('/students/:id/history', requireAuth, c.history);
router.get('/students/:id/discipline', ...MGMT, c.listDiscipline);
router.post('/students/:id/discipline', ...MGMT, c.addDiscipline);

// Student attendance: teachers for their own classes, management for any class.
router.get('/student-attendance/sheet', requireAuth, allowRoles(ROLES.TEACHER, ROLES.MANAGER), needs('students'), c.attendanceSheet);
router.post('/student-attendance', requireAuth, allowRoles(ROLES.TEACHER, ROLES.MANAGER), needs('students'), c.markAttendance);
router.get('/student-attendance/overview', ...MGMT, c.attendanceOverview);
router.get('/student-attendance/student/:id', requireAuth, c.studentAttendance);

module.exports = router;
