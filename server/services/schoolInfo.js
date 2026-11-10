const { query } = require('../config/db');
/** Name / phone used in outgoing messages. Reads the existing school_settings row; never throws. */
async function getSchoolInfo() {
  try {
    const { rows } = await query('SELECT name, phone, whatsapp FROM school_settings WHERE id = 1');
    return { name: rows[0]?.name || 'the school', phone: rows[0]?.phone || '', whatsapp: rows[0]?.whatsapp || '' };
  } catch { return { name: 'the school', phone: '', whatsapp: '' }; }
}
module.exports = { getSchoolInfo };
