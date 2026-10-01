const { asyncHandler } = require('../middleware/error-handler');
const announcements = require('../services/announcementService');

module.exports = {
  listPublic: asyncHandler(async (req, res) => res.json(await announcements.listPublicAnnouncements())),
  listAll: asyncHandler(async (req, res) => res.json(await announcements.listAllAnnouncements())),
  create: asyncHandler(async (req, res) => res.status(201).json(await announcements.createAnnouncement(req.body, req.user))),
  setStatus: asyncHandler(async (req, res) => res.json(await announcements.setAnnouncementStatus(req.params.id, req.body.status, req.user))),
};
