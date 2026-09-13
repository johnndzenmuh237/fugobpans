const { query } = require('../config/db');

async function notify({ toRole = null, toUserId = null, title, message, type = 'INFO', link = null }) {
  await query(
    `INSERT INTO notifications (to_role, to_user_id, title, message, type, link) VALUES ($1,$2,$3,$4,$5,$6)`,
    [toRole, toUserId, title, message, type, link]
  );
}

module.exports = { notify };
