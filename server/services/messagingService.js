/**
 * Outbound SMS / WhatsApp. Honest by design:
 *  - Credentials come ONLY from environment variables (never the database, never the browser).
 *  - If no provider is configured the message is recorded as NOT_CONFIGURED — it is never reported as sent.
 *  - Every attempt is written to message_outbox (one-time codes are stored as "[code hidden]").
 *
 * Providers (choose in Fee Reminders > Settings; fill the matching env vars):
 *   TWILIO          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM, TWILIO_WHATSAPP_FROM
 *   WHATSAPP_CLOUD  WHATSAPP_CLOUD_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE_NAME [, WHATSAPP_TEMPLATE_LANG]
 *                   (Meta only allows business-initiated WhatsApp messages through APPROVED TEMPLATES; the template
 *                    must have exactly one body variable {{1}}, which receives the message text.)
 *   HTTP_GATEWAY    SMS_GATEWAY_URL, SMS_GATEWAY_TOKEN [, SMS_GATEWAY_SENDER]  (POST JSON {to, message, sender})
 */
const axios = require('axios');
const { query } = require('../config/db');
const { toE164 } = require('../utils/phone');

const env = (k) => (process.env[k] || '').trim();

function configured() {
  return {
    TWILIO: { SMS: !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_SMS_FROM')),
              WHATSAPP: !!(env('TWILIO_ACCOUNT_SID') && env('TWILIO_AUTH_TOKEN') && env('TWILIO_WHATSAPP_FROM')) },
    WHATSAPP_CLOUD: { SMS: false, WHATSAPP: !!(env('WHATSAPP_CLOUD_TOKEN') && env('WHATSAPP_PHONE_NUMBER_ID') && env('WHATSAPP_TEMPLATE_NAME')) },
    HTTP_GATEWAY: { SMS: !!(env('SMS_GATEWAY_URL') && env('SMS_GATEWAY_TOKEN')), WHATSAPP: false },
  };
}

async function getMessagingSettings() {
  const { rows } = await query('SELECT * FROM messaging_settings WHERE id = 1');
  return rows[0] || null;
}

async function deliver(provider, channel, to, body) {
  const timeout = 15000;
  if (provider === 'TWILIO') {
    const sid = env('TWILIO_ACCOUNT_SID');
    const from = channel === 'WHATSAPP' ? `whatsapp:${env('TWILIO_WHATSAPP_FROM')}` : env('TWILIO_SMS_FROM');
    const params = new URLSearchParams({ To: channel === 'WHATSAPP' ? `whatsapp:${to}` : to, From: from, Body: body });
    const r = await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, params.toString(), {
      auth: { username: sid, password: env('TWILIO_AUTH_TOKEN') }, timeout, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return r.data.sid;
  }
  if (provider === 'WHATSAPP_CLOUD') {
    const r = await axios.post(`https://graph.facebook.com/v20.0/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
      messaging_product: 'whatsapp', to: to.replace('+', ''), type: 'template',
      template: { name: env('WHATSAPP_TEMPLATE_NAME'), language: { code: env('WHATSAPP_TEMPLATE_LANG') || 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: body.slice(0, 1000) }] }] },
    }, { headers: { Authorization: `Bearer ${env('WHATSAPP_CLOUD_TOKEN')}` }, timeout });
    return r.data?.messages?.[0]?.id || null;
  }
  if (provider === 'HTTP_GATEWAY') {
    const r = await axios.post(env('SMS_GATEWAY_URL'), { to, message: body, sender: env('SMS_GATEWAY_SENDER') || undefined },
      { headers: { Authorization: `Bearer ${env('SMS_GATEWAY_TOKEN')}` }, timeout });
    return r.data?.id || r.data?.messageId || null;
  }
  throw new Error('No provider selected.');
}

async function record(row) {
  try {
    const { rows } = await query(
      `INSERT INTO message_outbox (kind, channel, to_phone, student_id, invoice_id, body, status, provider, provider_message_id, error, sent_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [row.kind, row.channel, String(row.to || '').slice(0, 30), row.studentId || null, row.invoiceId || null, row.hideBody ? '[code hidden]' : row.body, row.status,
        row.provider || null, row.providerMessageId || null, row.error ? String(row.error).slice(0, 300) : null, row.sentBy || null]);
    return rows[0].id;
  } catch (e) { console.error('[messaging] could not write outbox:', e.message); return null; }
}

/**
 * Send one message. Never throws. Returns { status: 'SENT'|'FAILED'|'NOT_CONFIGURED', outboxId, error? }.
 */
async function sendMessage({ kind, channel, to, body, studentId = null, invoiceId = null, hideBody = false, sentBy = null }) {
  const settings = await getMessagingSettings().catch(() => null);
  const provider = settings?.provider || 'NONE';
  const e164 = toE164(to);
  const base = { kind, channel, to: e164 || String(to || ''), studentId, invoiceId, body, hideBody, provider, sentBy };
  if (!e164) return { status: 'FAILED', error: 'Invalid phone number.', outboxId: await record({ ...base, status: 'FAILED', error: 'Invalid phone number.' }) };
  if (provider === 'NONE' || !configured()[provider]?.[channel]) {
    const why = provider === 'NONE' ? 'No messaging provider selected.' : `${provider} is not configured for ${channel} (missing environment variables).`;
    return { status: 'NOT_CONFIGURED', error: why, outboxId: await record({ ...base, status: 'NOT_CONFIGURED', error: why }) };
  }
  try {
    const providerMessageId = await deliver(provider, channel, e164, body);
    return { status: 'SENT', outboxId: await record({ ...base, status: 'SENT', providerMessageId }) };
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error?.message || e.message;
    return { status: 'FAILED', error: msg, outboxId: await record({ ...base, status: 'FAILED', error: msg }) };
  }
}

/** Staff sent it themselves through the wa.me link — keep the record so the same reminder isn't chased twice. */
async function recordManual({ kind = 'REMINDER', channel = 'WHATSAPP', to, body, studentId, invoiceId, sentBy }) {
  return record({ kind, channel, to: toE164(to) || String(to), studentId, invoiceId, body, status: 'MANUAL', sentBy });
}

module.exports = { configured, getMessagingSettings, sendMessage, recordManual };
