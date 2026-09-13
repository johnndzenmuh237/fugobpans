require('dotenv').config();
const { runAbsenceSweep } = require('../server/services/attendanceService');

runAbsenceSweep()
  .then((result) => { console.log(`[absence-sweep] Marked ${result.markedAbsent} employee(s) absent.`); process.exit(0); })
  .catch((err) => { console.error('[absence-sweep] Failed:', err); process.exit(1); });
