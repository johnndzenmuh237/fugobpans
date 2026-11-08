const nodemailer = require('nodemailer');

/** Sends mail only when EMAIL_HOST is configured. Returns true if sent. Never logs secrets. */
async function sendMail({ to, subject, text }) {
  if (!process.env.EMAIL_HOST) return false;
  const transport = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: process.env.EMAIL_USERNAME ? { user: process.env.EMAIL_USERNAME, pass: process.env.EMAIL_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME, to, subject, text });
  return true;
}
module.exports = { sendMail };
