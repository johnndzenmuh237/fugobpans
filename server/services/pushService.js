/**
 * Web Push (RFC 8030 + VAPID RFC 8292 + message encryption RFC 8291 "aes128gcm"), implemented with Node's built-in
 * crypto so no extra package is needed. Needs three environment variables (see scripts/generate-vapid-keys.js):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:owner@yourschool.com)
 * Without them push is reported as "not configured" and everything else keeps working (in-app bell is unaffected).
 */
const crypto = require('crypto');
const { query } = require('../config/db');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');

function config() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  const pubBuf = fromB64u(pub);
  if (pubBuf.length !== 65 || pubBuf[0] !== 4 || fromB64u(priv).length !== 32) return null;
  return { pub, priv, subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com' };
}
const isConfigured = () => !!config();
const publicKey = () => (config() ? config().pub : null);

function generateVapidKeys() {
  const { publicKey: pk, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]);
  return { publicKey: b64u(pub), privateKey: jwk.d };
}

/** VAPID JWT (ES256) proving to the push service that this server is the registered sender. */
function vapidJwt(audience, cfg, now = Date.now()) {
  const pub = fromB64u(cfg.pub);
  const key = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: cfg.priv, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: cfg.subject }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64u(sig)}`;
}

/** RFC 8291 encryption of one message for one subscription. `opts` lets tests pin the ephemeral key and salt. */
function encrypt(payload, sub, opts = {}) {
  const uaPublic = fromB64u(sub.p256dh);
  const authSecret = fromB64u(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('Malformed subscription keys');
  const ecdh = opts.ecdh || crypto.createECDH('prime256v1');
  if (!opts.ecdh) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = opts.salt || crypto.randomBytes(16);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const data = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 0x02 = last record
  if (data.length > 4096 - 17) throw new Error('Push payload too large');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0); header.writeUInt32BE(4096, 16); header[20] = 65;
  return Buffer.concat([header, asPublic, ct]);
}

/** Sends to one subscription row. Returns { ok, gone, status }. `gone` means the subscription is dead and must be deleted. */
async function sendOne(sub, payloadObj, { ttl = 86400, urgency = 'normal' } = {}) {
  const cfg = config();
  if (!cfg) return { ok: false, gone: false, status: 0, error: 'not-configured' };
  try {
    const url = new URL(sub.endpoint);
    if (url.protocol !== 'https:') return { ok: false, gone: true, status: 0 };
    const body = encrypt(JSON.stringify(payloadObj), sub);
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${vapidJwt(url.origin, cfg)}, k=${cfg.pub}`,
        'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
        TTL: String(ttl), Urgency: urgency,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    return { ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410, status: res.status };
  } catch (e) {
    return { ok: false, gone: false, status: 0, error: e.message };
  }
}

/** Does this person want this kind of push? (master switch + per-kind switch; default is yes.) */
async function wants(userIds, kind) {
  if (!userIds.length) return [];
  const col = kind === 'message' ? 'push_messages' : 'push_updates';
  const { rows } = await query(`SELECT user_id FROM notification_preferences WHERE user_id = ANY($1::uuid[]) AND (push_enabled = false OR ${col} = false)`, [userIds]);
  const blocked = new Set(rows.map((r) => r.user_id));
  return userIds.filter((u) => !blocked.has(u));
}

/**
 * Push to specific users' devices. Never throws. Dead subscriptions (404/410) are deleted at once; transient failures are
 * counted and the subscription is dropped after 5 consecutive failures.
 */
async function pushToUsers(userIds, { title, body, url = '/', tag, kind = 'update' }) {
  try {
    if (!isConfigured() || !userIds.length) return { sent: 0 };
    const allowed = await wants([...new Set(userIds)], kind);
    if (!allowed.length) return { sent: 0 };
    const { rows: subs } = await query('SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[])', [allowed]);
    const payload = { title: String(title).slice(0, 100), body: String(body || '').slice(0, 180), url, tag: tag || undefined };
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      const r = await sendOne(s, payload);
      if (r.ok) { sent += 1; await query('UPDATE push_subscriptions SET failures = 0, last_success_at = now() WHERE id = $1', [s.id]); }
      else if (r.gone) await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]);
      else await query('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = $1', [s.id]).then(() => query('DELETE FROM push_subscriptions WHERE id = $1 AND failures >= 5', [s.id]));
    }));
    return { sent };
  } catch (e) {
    console.error('[push] failed:', e.message);
    return { sent: 0 };
  }
}

module.exports = { isConfigured, publicKey, generateVapidKeys, vapidJwt, encrypt, sendOne, pushToUsers };
