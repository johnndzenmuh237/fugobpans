// Pings the Render API every 10 minutes so the free web service does not go to sleep.
// It calls /api/health, which does NOT touch the database, so Neon is still allowed to sleep.
// Requires the Firebase "Blaze" (pay-as-you-go) plan; at this volume the cost is normally zero.
// Set the target once:  firebase functions:secrets / or create firebase/functions/.env with
//   API_HEALTH_URL=https://YOUR-SERVICE.onrender.com/api/health
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');

exports.keepRenderAwake = onSchedule({ schedule: 'every 10 minutes', timeZone: 'Africa/Douala', region: 'europe-west1', retryCount: 0 }, async () => {
  const url = process.env.API_HEALTH_URL;
  if (!url) { logger.error('API_HEALTH_URL is not set'); return; }
  try {
    const started = Date.now();
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    logger.info(`keepalive ${res.status} in ${Date.now() - started}ms`);
  } catch (e) { logger.warn(`keepalive failed: ${e.message}`); }
});
