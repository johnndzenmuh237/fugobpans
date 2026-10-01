const { asyncHandler } = require('../middleware/error-handler');
const notes = require('../services/noteService');

module.exports = {
  create: asyncHandler(async (req, res) => res.status(201).json(await notes.createStudentNote(req.body, req.user))),
  listForStudent: asyncHandler(async (req, res) => res.json(await notes.listNotesForStudent(req.params.studentId))),
};
