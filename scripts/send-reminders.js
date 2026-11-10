/**
 * Sends today's fee reminders. Safe to run as often as you like (a reminder is never sent twice on the same day).
 * Schedule it once a day, e.g. on Render: a Cron Job with command  `npm run send-reminders`  at 07:00 (Africa/Douala = UTC+1 -> 06:00 UTC).
 * Does nothing unless the Owner switched reminders on and a messaging provider is configured.
 */
require('dotenv').config();
const { pool } = require('../server/config/db');
const { run } = require('../server/services/reminderService');

run({ actor: null })
  .then((r) => { console.log('[send-reminders]', JSON.stringify(r)); })
  .catch((e) => { console.error('[send-reminders] failed:', e.message); process.exitCode = 1; })
  .finally(() => pool.end());
