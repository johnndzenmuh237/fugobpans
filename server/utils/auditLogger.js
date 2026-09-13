const { query } = require('../config/db');

async function writeAudit({ user, action, entity, entityId, before = null, after = null, req = null }) {
  await query(
    `INSERT INTO audit_logs (user_id, user_name, user_role, action, entity, entity_id, before_data, after_data, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      user?.uid || null,
      user?.name || 'System',
      user?.role || 'SYSTEM',
      action,
      entity,
      entityId || null,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null) : null,
    ]
  );
}

module.exports = { writeAudit };
