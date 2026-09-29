const { asyncHandler, AppError } = require('../middleware/error-handler');
const academics = require('../services/academicsService');
const employees = require('../services/employeeService');
const attendance = require('../services/attendanceService');
const payroll = require('../services/payrollService');
const dashboard = require('../services/dashboardService');
const { query } = require('../config/db');

const academicsController = {
  listCategories: asyncHandler(async (req, res) => res.json(await academics.listCategories())),
  createCategory: asyncHandler(async (req, res) => res.status(201).json(await academics.createCategory(req.body, req.user))),
  listClasses: asyncHandler(async (req, res) => res.json(await academics.listClasses(req.query.categoryId))),
  createClass: asyncHandler(async (req, res) => res.status(201).json(await academics.createClass(req.body, req.user))),
  assignClassTeacher: asyncHandler(async (req, res) => { await academics.assignClassTeacher(req.params.id, req.body.employeeId, req.user); res.json({ ok: true }); }),
  listSubjects: asyncHandler(async (req, res) => res.json(await academics.listSubjects())),
  createSubject: asyncHandler(async (req, res) => res.status(201).json(await academics.createSubject(req.body, req.user))),
  assignSubjectTeacher: asyncHandler(async (req, res) => { await academics.assignSubjectTeacher(req.params.id, req.body, req.user); res.json({ ok: true }); }),
  createFeeStructure: asyncHandler(async (req, res) => res.status(201).json(await academics.createFeeStructure(req.body, req.user))),
  listFeeStructures: asyncHandler(async (req, res) => res.json(await academics.listFeeStructures(req.query))),
  listSessions: asyncHandler(async (req, res) => res.json(await academics.listSessions())),
  createSession: asyncHandler(async (req, res) => res.status(201).json(await academics.createSession(req.body, req.user))),
};

const employeeController = {
  list: asyncHandler(async (req, res) => res.json(await employees.listEmployees(req.query))),
  getOne: asyncHandler(async (req, res) => res.json(await employees.getEmployeeProfile(req.params.id))),
  /** TEACHER/EMPLOYEE/ACCOUNTANT self-service — their own full record (new feature). */
  getMe: asyncHandler(async (req, res) => {
    if (!req.user.linkedEmployeeId) throw new AppError('This login is not linked to a worker record.', 403);
    res.json(await employees.getEmployeeProfile(req.user.linkedEmployeeId));
  }),
  create: asyncHandler(async (req, res) => res.status(201).json(await employees.createEmployee(req.body, req.user))),
  createLogin: asyncHandler(async (req, res) => res.status(201).json(await employees.createEmployeeLogin(req.body, req.user))),
  listPositions: asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM positions ORDER BY name');
    res.json(rows);
  }),
  createPosition: asyncHandler(async (req, res) => {
    const { rows } = await query('INSERT INTO positions (name, department_id, default_salary) VALUES ($1,$2,$3) RETURNING *', [req.body.name, req.body.departmentId || null, req.body.defaultSalary || 0]);
    res.status(201).json(rows[0]);
  }),
  listDepartments: asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM departments ORDER BY name');
    res.json(rows);
  }),
  createDepartment: asyncHandler(async (req, res) => {
    const { rows } = await query('INSERT INTO departments (name) VALUES ($1) RETURNING *', [req.body.name]);
    res.status(201).json(rows[0]);
  }),
};

const attendanceController = {
  roster: asyncHandler(async (req, res) => res.json(await attendance.getRoster(req.query.date))),
  markSelf: asyncHandler(async (req, res) => res.json(await attendance.markSelfPresent(req.user.linkedEmployeeId))),
  markManual: asyncHandler(async (req, res) => res.json(await attendance.markManual(req.body, req.user))),
  history: asyncHandler(async (req, res) => res.json(await attendance.attendanceHistory(req.params.employeeId))),
  todaySummary: asyncHandler(async (req, res) => res.json(await attendance.todaySummary(req.query.date))),
  runSweep: asyncHandler(async (req, res) => res.json(await attendance.runAbsenceSweep(req.body.date))),
};

const payrollController = {
  updateSalary: asyncHandler(async (req, res) => res.status(201).json(await payroll.updateSalary(req.body, req.user))),
  generate: asyncHandler(async (req, res) => res.status(201).json(await payroll.generatePayroll(req.body, req.user))),
  markPaid: asyncHandler(async (req, res) => res.json(await payroll.markPayrollItemPaid(req.params.itemId, req.user, req.body?.amount))),
  listRuns: asyncHandler(async (req, res) => res.json(await payroll.listPayrollRuns())),
  listItems: asyncHandler(async (req, res) => res.json(await payroll.listPayrollItems(req.params.runId))),
};

const dashboardController = {
  overview: asyncHandler(async (req, res) => res.json(await dashboard.overview())),
  registrations: asyncHandler(async (req, res) => res.json(await dashboard.registrationsOverview(req.query))),
  categoryBreakdown: asyncHandler(async (req, res) => res.json(await dashboard.categoryBreakdown())),
};

const results = require('../services/examResultsService');
const resultsController = {
  /** Classes/subjects this teacher is actually assigned — nothing typed, all derived (new feature). */
  myClasses: asyncHandler(async (req, res) => res.json(await results.myClasses(req.user.linkedEmployeeId))),
  mySubjects: asyncHandler(async (req, res) => res.json(await results.mySubjects(req.user.linkedEmployeeId, req.query.classId))),
  /** Auto-populated roster for a class+subject+term — the teacher never types a student name. */
  sheet: asyncHandler(async (req, res) => res.json(await results.getResultsSheet(req.query))),
  save: asyncHandler(async (req, res) => res.status(201).json(await results.saveResult(req.body, req.user))),
  forStudent: asyncHandler(async (req, res) => res.json(await results.resultsForStudent(req.params.studentId))),
};

module.exports = { academicsController, employeeController, attendanceController, payrollController, dashboardController, resultsController };
