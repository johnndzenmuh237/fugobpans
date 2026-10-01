const { asyncHandler, AppError } = require('../middleware/error-handler');
const leave = require('../services/leaveService');

module.exports = {
  submitMyLeave: asyncHandler(async (req, res) => {
    if (!req.user.linkedEmployeeId) throw new AppError('Your account is not linked to an employee record.');
    res.status(201).json(await leave.submitLeaveRequest({ ...req.body, employeeId: req.user.linkedEmployeeId }, req.user));
  }),
  listMyLeave: asyncHandler(async (req, res) => {
    if (!req.user.linkedEmployeeId) throw new AppError('Your account is not linked to an employee record.');
    res.json(await leave.listLeaveForEmployee(req.user.linkedEmployeeId));
  }),
  listAll: asyncHandler(async (req, res) => res.json(await leave.listLeaveRequests(req.query))),
  decide: asyncHandler(async (req, res) => res.json(await leave.decideLeaveRequest(req.params.leaveId, req.body, req.user))),
};
