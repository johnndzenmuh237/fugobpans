/**
 * Tracking-number recovery (addition #3) and optional record-lookup verification.
 *
 * Recovery: guardian types the phone number they gave the school -> a 6-digit code is sent to THAT number ->
 * entering it shows the tracking numbers of the children registered under it.
 *
 * Security properties
 *  - The reply to "send me a code" is identical whether or not the number is registered (no number enumeration).
 *  - Codes: 6 digits from crypto.randomInt, stored only as an HMAC, valid 10 minutes, single use, 5 wrong tries.
 *  - At most 3 codes per phone per hour (database-enforced) plus a per-IP rate limit on the endpoints.
 *  - If no SMS/WhatsApp provider is configured, the service says so plainly and sends nothing. It never shows a code on screen.
 *  - Every successful recovery is written to the audit log.
 */
const crypto = require('crypto');
const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');
const { clientIp } = require('../utils/paymentHistory');
const { last9 } = require('../utils/phone');
const messaging = require('./messagingService');
const { getSchoolInfo } = require('./schoolInfo');
const { issuePortalToken } = require('./verificationService');

const TTL_MIN = 10, MAX_ATTEMPTS = 5, MAX_CODES_PER_HOUR = 3;
const GENERIC = 'If that number is registered with the school, a 6-digit code has been sent to it. It is valid for 10 minutes.';

const secret = () => process.env.JWT_SECRET || '';
const hashCode = (purpose, phoneNorm, code) => crypto.createHmac('sha256', secret()).update(`${purpose}:${phoneNorm}:${code}`).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Which channel can actually deliver right now? null when nothing is configured. */
async function deliverableChannel() {
  const s = await messaging.getMessagingSettings().catch(() => null);
  const cfg = s && messaging.configured()[s.provider];
  if (!cfg) return null;
  const order = s.channel === 'WHATSAPP' ? ['WHATSAPP', 'SMS'] : ['SMS', 'WHATSAPP'];
  return order.find((c) => cfg[c]) || null;
}

async function issueCode({ purpose, phoneNorm, studentId, to, ip }) {
  const { rows: recent } = await query(`SELECT count(*)::int AS n FROM phone_otps WHERE phone_norm = $1 AND purpose = $2 AND created_at > now() - interval '1 hour'`, [phoneNorm, purpose]);
  if (recent[0].n >= MAX_CODES_PER_HOUR) return { throttled: true };
  const channel = await deliverableChannel();
  if (!channel) return { unavailable: true };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const { rows } = await query(
    `INSERT INTO phone_otps (purpose, phone_norm, student_id, code_hash, expires_at, ip) VALUES ($1,$2,$3,$4, now() + make_interval(mins => $5::int), $6) RETURNING id`,
    [purpose, phoneNorm, studentId, hashCode(purpose, phoneNorm, code), TTL_MIN, ip]);
  const school = await getSchoolInfo();
  const r = await messaging.sendMessage({ kind: 'OTP', channel, to, hideBody: true, studentId,
    body: `${school.name}: your verification code is ${code}. It expires in ${TTL_MIN} minutes. Never share it with anyone.` });
  if (r.status !== 'SENT') await query('UPDATE phone_otps SET used_at = now() WHERE id = $1', [rows[0].id]); // undeliverable code is dead
  return { sent: r.status === 'SENT' };
}

async function consumeCode({ purpose, phoneNorm, code }) {
  const { rows } = await query(
    `SELECT * FROM phone_otps WHERE phone_norm = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1`, [phoneNorm, purpose]);
  const otp = rows[0];
  const bad = new AppError('That code is incorrect or has expired. Request a new one if needed.', 400);
  if (!otp) throw bad;
  if (otp.attempts >= MAX_ATTEMPTS) throw new AppError('Too many wrong attempts. Please request a new code.', 429);
  if (!/^\d{6}$/.test(String(code || '')) || !safeEq(otp.code_hash, hashCode(purpose, phoneNorm, String(code)))) {
    await query('UPDATE phone_otps SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    throw bad;
  }
  const { rowCount } = await query('UPDATE phone_otps SET used_at = now() WHERE id = $1 AND used_at IS NULL', [otp.id]); // atomic: one use only
  if (!rowCount) throw bad;
  return otp;
}

const STUDENTS_BY_PHONE = `
  SELECT s.id, s.first_name, s.middle_name, s.last_name, s.student_code, s.tracking_code, s.guardian_phone, s.guardian_whatsapp, c.name AS class_name
  FROM students s JOIN classes c ON c.id = s.class_id
  WHERE s.status IN ('ACTIVE','SUSPENDED')
    AND (right(regexp_replace(s.guardian_phone, '\\D', '', 'g'), 9) = $1 OR right(regexp_replace(COALESCE(s.guardian_whatsapp, ''), '\\D', '', 'g'), 9) = $1)
  ORDER BY s.first_name`;

// ------------------------------------------------------------ recovery
async function requestRecovery(phone, req) {
  const norm = last9(phone);
  if (!norm) throw new AppError('Enter the phone number you gave the school when registering (at least 9 digits).');
  if (!(await deliverableChannel())) {
    return { ok: false, available: false, message: 'Automatic recovery by SMS/WhatsApp is not switched on yet. Please call or WhatsApp the school office and we will help you right away.' };
  }
  const { rows } = await query(STUDENTS_BY_PHONE, [norm]);
  // Not awaited on purpose: the reply takes the same time whether or not the number is registered (no timing leak).
  if (rows.length) issueCode({ purpose: 'RECOVERY', phoneNorm: norm, studentId: null, to: phone, ip: clientIp(req) }).catch((e) => console.error('[recovery] send failed:', e.message));
  return { ok: true, available: true, message: GENERIC };
}

async function verifyRecovery(phone, code, req) {
  const norm = last9(phone);
  if (!norm) throw new AppError('Enter the phone number you used.');
  await consumeCode({ purpose: 'RECOVERY', phoneNorm: norm, code });
  const { rows } = await query(STUDENTS_BY_PHONE, [norm]);
  await writeAudit({ user: null, action: 'RECOVER_TRACKING_CODE', entity: 'students', after: { phoneEnding: norm.slice(-3), studentIds: rows.map((r) => r.id) }, req }).catch(() => {});
  return { children: rows.map((r) => ({ name: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' '), className: r.class_name, studentCode: r.student_code, trackingCode: r.tracking_code })) };
}

// ------------------------------------------------------------ optional: verify before showing a record
async function requestLookupOtp(trackingCode, req) {
  if (!(await deliverableChannel())) return { ok: false, available: false, message: 'Verification codes cannot be sent right now. Please contact the school office.' };
  const { rows } = await query(`SELECT id, guardian_phone FROM students WHERE tracking_code = $1 AND status IN ('ACTIVE','SUSPENDED')`, [String(trackingCode || '').trim().toUpperCase()]);
  const st = rows[0];
  if (st && last9(st.guardian_phone)) issueCode({ purpose: 'LOOKUP', phoneNorm: last9(st.guardian_phone), studentId: st.id, to: st.guardian_phone, ip: clientIp(req) }).catch((e) => console.error('[lookup-otp] send failed:', e.message));
  return { ok: true, available: true, message: 'If the tracking number is valid, a 6-digit code was sent to the guardian\'s registered phone. It is valid for 10 minutes.' };
}

async function verifyLookupOtp(trackingCode, code) {
  const { rows } = await query(`SELECT id, guardian_phone FROM students WHERE tracking_code = $1 AND status IN ('ACTIVE','SUSPENDED')`, [String(trackingCode || '').trim().toUpperCase()]);
  const st = rows[0];
  if (!st || !last9(st.guardian_phone)) throw new AppError('That code is incorrect or has expired. Request a new one if needed.');
  await consumeCode({ purpose: 'LOOKUP', phoneNorm: last9(st.guardian_phone), code });
  return { accessToken: issuePortalToken(st.id), expiresInMinutes: 30 };
}

module.exports = { requestRecovery, verifyRecovery, requestLookupOtp, verifyLookupOtp };
