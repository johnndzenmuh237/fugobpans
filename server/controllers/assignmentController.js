const { asyncHandler, AppError } = require('../middleware/error-handler');
const svc = require('../services/assignmentService');

const create = asyncHandler(async (req, res) => res.status(201).json(await svc.createAssignment(req.body, req.user)));
const listMine = asyncHandler(async (req, res) => res.json(await svc.listForTeacher(req.user.linkedEmployeeId)));

const listForStudent = asyncHandler(async (req, res) => {
  if (!req.user.linkedStudentId) throw new AppError('This login is not linked to a student record.', 403);
  res.json(await svc.listForStudent(req.user.linkedStudentId));
});

const update = asyncHandler(async (req, res) => res.json(await svc.updateAssignment(req.params.id, req.body, req.user)));
const remove = asyncHandler(async (req, res) => { await svc.deleteAssignment(req.params.id, req.user); res.json({ ok: true }); });

module.exports = { create, listMine, listForStudent, update, remove };
