/** Prints a fresh VAPID key pair for web push. Run once, then add the three values to your server environment (Render > Environment). */
const { generateVapidKeys } = require('../server/services/pushService');
const k = generateVapidKeys();
console.log('Add these to your environment variables (keep the private key secret, never commit it):\n');
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${k.privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@yourschool.com');
