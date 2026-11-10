/**
 * Automatic payment reminders (addition #2) + instalment schedule management.
 *
 * Who is reminded: guardians of ACTIVE students whose invoice still has a balance.
 * When: planned by utils/reminderPlan.js (before the due date, on it, repeatedly after it, or a plain "balance" nudge
 *       for invoices that have no instalment schedule).
 * How: SMS and/or WhatsApp through messagingService. If no provider is configured NOTHING is claimed as sent; the
 *       preview still lists who should be reminded, with a one-tap WhatsApp link so staff can send it by hand
 *       and record it (so the same family isn't chased twice).
 * Never twice: reminder_log has a unique (invoice, instalment, kind, day) index.
 */
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');
const { planReminders, renderTemplate } = require('../utils/reminderPlan');
const { waLink } = require('../utils/phone');
const messaging = require('./messagingService');
const { getSchoolInfo } = require('./schoolInfo');

const todayInSchoolTz = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.SCHOOL_TZ || 'Africa/Douala' });
const money = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');

// ------------------------------------------------------------ settings
const PROVIDERS = ['NONE', 'TWILIO', 'WHATSAPP_CLOUD', 'HTTP_GATEWAY'];
const CHANNELS = ['SMS', 'WHATSAPP', 'BOTH'];
const ENV_NEEDED = {
  TWILIO: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_SMS_FROM (for SMS)', 'TWILIO_WHATSAPP_FROM (for WhatsApp)'],
  WHATSAPP_CLOUD: ['WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE_NAME', 'WHATSAPP_TEMPLATE_LANG (optional)'],
  HTTP_GATEWAY: ['SMS_GATEWAY_URL', 'SMS_GATEWAY_TOKEN', 'SMS_GATEWAY_SENDER (optional)'],
};

async function getSettings() {
  const s = await messaging.getMessagingSettings();
  if (!s) throw new AppError('Messaging settings are missing — run "npm run upgrade-db".', 500);
  return { ...s, configured: messaging.configured(), envNeeded: ENV_NEEDED };
}

async function updateSettings(body, actor, req) {
  const before = await messaging.getMessagingSettings();
  const next = { ...before };
  if (body.provider !== undefined) { if (!PROVIDERS.includes(body.provider)) throw new AppError('Unknown provider.'); next.provider = body.provider; }
  if (body.channel !== undefined) { if (!CHANNELS.includes(body.channel)) throw new AppError('Channel must be SMS, WHATSAPP or BOTH.'); next.channel = body.channel; }
  if (body.daysBefore !== undefined) {
    const d = [...new Set((Array.isArray(body.daysBefore) ? body.daysBefore : String(body.daysBefore).split(/[,\s]+/)).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 60))].sort((a, b) => b - a);
    if (d.length > 6) throw new AppError('Use at most 6 "days before" values.');
    next.days_before = d;
  }
  for (const [k, col, max] of [['overdueEveryDays', 'overdue_every_days', 60], ['maxOverdueReminders', 'max_overdue_reminders', 30], ['outstandingEveryDays', 'outstanding_every_days', 90]]) {
    if (body[k] !== undefined) { const n = Number(body[k]); if (!Number.isInteger(n) || n < 0 || n > max) throw new AppError(`${k} must be a whole number from 0 to ${max}.`); next[col] = n; }
  }
  for (const [k, col] of [['remindersEnabled', 'reminders_enabled'], ['remindOnDue', 'remind_on_due'], ['requireOtpForLookup', 'require_otp_for_lookup']]) {
    if (body[k] !== undefined) next[col] = body[k] === true;
  }
  for (const [k, col] of [['templateUpcoming', 'template_upcoming'], ['templateDue', 'template_due'], ['templateOverdue', 'template_overdue'], ['templateBalance', 'template_balance']]) {
    if (body[k] !== undefined) { const t = String(body[k]).trim(); if (t.length < 10 || t.length > 480) throw new AppError('Each message must be 10–480 characters.'); next[col] = t; }
  }
  if (next.reminders_enabled && next.provider === 'NONE') throw new AppError('Choose a messaging provider before switching reminders on.');
  if (next.require_otp_for_lookup && (next.provider === 'NONE')) throw new AppError('Record look-up verification needs a working SMS/WhatsApp provider. Choose and configure one first, otherwise no family could get in.');
  if (next.require_otp_for_lookup) {
    const cfg = messaging.configured()[next.provider] || {};
    if (!cfg.SMS && !cfg.WHATSAPP) throw new AppError('The selected provider is not configured on the server yet (missing environment variables), so verification codes could not be delivered.');
  }
  await query(
    `UPDATE messaging_settings SET provider=$1, channel=$2, days_before=$3, overdue_every_days=$4, max_overdue_reminders=$5, outstanding_every_days=$6,
       reminders_enabled=$7, remind_on_due=$8, require_otp_for_lookup=$9, template_upcoming=$10, template_due=$11, template_overdue=$12, template_balance=$13,
       updated_by=$14, updated_at=now() WHERE id = 1`,
    [next.provider, next.channel, next.days_before, next.overdue_every_days, next.max_overdue_reminders, next.outstanding_every_days, next.reminders_enabled,
      next.remind_on_due, next.require_otp_for_lookup, next.template_upcoming, next.template_due, next.template_overdue, next.template_balance, actor.uid]);
  await writeAudit({ user: actor, action: 'UPDATE_MESSAGING_SETTINGS', entity: 'messaging_settings', before: { provider: before.provider, channel: before.channel, enabled: before.reminders_enabled }, after: { provider: next.provider, channel: next.channel, enabled: next.reminders_enabled }, req }).catch(() => {});
  return getSettings();
}

// ------------------------------------------------------------ planning (shared by preview and run)
async function buildPlan() {
  const settings = await messaging.getMessagingSettings();
  const school = await getSchoolInfo();
  const today = todayInSchoolTz();
  const { rows: invs } = await query(
    `SELECT i.id, i.invoice_number, i.total_amount, i.amount_paid, s.id AS student_id, s.first_name, s.last_name, s.guardian_name, s.guardian_phone, s.guardian_whatsapp, c.name AS class_name
     FROM invoices i JOIN students s ON s.id = i.student_id JOIN classes c ON c.id = s.class_id
     WHERE i.balance > 0 AND s.status = 'ACTIVE' ORDER BY s.last_name, s.first_name`);
  if (!invs.length) return { today, settings, school, items: [] };
  const ids = invs.map((i) => i.id);
  const [inst, sent] = await Promise.all([
    query(`SELECT id, invoice_id, name, amount, to_char(due_date,'YYYY-MM-DD') AS due_date, sort_order FROM invoice_installments WHERE invoice_id = ANY($1)`, [ids]),
    query(`SELECT invoice_id, installment_id, kind, to_char(sent_on,'YYYY-MM-DD') AS sent_on FROM reminder_log WHERE invoice_id = ANY($1)`, [ids]),
  ]);
  const items = [];
  for (const inv of invs) {
    const plans = planReminders({
      today, settings, invoice: inv,
      installments: inst.rows.filter((r) => r.invoice_id === inv.id),
      sent: sent.rows.filter((r) => r.invoice_id === inv.id),
    });
    for (const p of plans) {
      const vars = { student: `${inv.first_name} ${inv.last_name}`, guardian: inv.guardian_name || 'Parent/Guardian', amount: money(p.amountDue), balance: money(p.balance),
        due_date: p.dueDate || '', invoice: inv.invoice_number, school: school.name, phone: school.phone || '' };
      const body = renderTemplate(settings[`template_${p.template}`], vars);
      items.push({ ...p, invoiceId: inv.id, studentId: inv.student_id, student: vars.student, className: inv.class_name, guardian: vars.guardian,
        phone: inv.guardian_phone, whatsapp: inv.guardian_whatsapp || inv.guardian_phone, body, waLink: waLink(inv.guardian_whatsapp || inv.guardian_phone, body) });
    }
  }
  return { today, settings, school, items };
}

async function preview() {
  const { today, settings, items } = await buildPlan();
  return { today, enabled: settings.reminders_enabled, provider: settings.provider, channel: settings.channel, providerReady: providerReady(settings), items };
}

function providerReady(settings) {
  const cfg = messaging.configured()[settings.provider];
  if (!cfg) return false;
  return settings.channel === 'SMS' ? cfg.SMS : settings.channel === 'WHATSAPP' ? cfg.WHATSAPP : (cfg.SMS || cfg.WHATSAPP);
}

async function logSent(item, outboxId, today) {
  try { await query('INSERT INTO reminder_log (invoice_id, installment_id, kind, sent_on, outbox_id) VALUES ($1,$2,$3,$4,$5)', [item.invoiceId, item.installmentId, item.kind, today, outboxId]); }
  catch (e) { if (e.code !== '23505') throw e; }
}

/** Sends everything that is due today. Safe to run as often as you like. Used by the button and by `npm run send-reminders`. */
async function run({ actor = null, req = null } = {}) {
  const { today, settings, items } = await buildPlan();
  if (!settings.reminders_enabled) return { ran: false, reason: 'Automatic reminders are switched off in Fee Reminders → Settings.', sent: 0, failed: 0, total: items.length };
  if (!providerReady(settings)) return { ran: false, reason: 'No messaging provider is configured on the server for the selected channel, so nothing was sent. Use the WhatsApp links in the preview, or finish the provider setup.', sent: 0, failed: 0, total: items.length };
  let sent = 0, failed = 0;
  const cfg = messaging.configured()[settings.provider];
  for (const it of items) {
    const channels = settings.channel === 'BOTH' ? ['SMS', 'WHATSAPP'] : [settings.channel];
    let ok = false, lastOutbox = null;
    for (const ch of channels) {
      if (!cfg[ch]) continue;
      const r = await messaging.sendMessage({ kind: 'REMINDER', channel: ch, to: ch === 'WHATSAPP' ? it.whatsapp : it.phone, body: it.body, studentId: it.studentId, invoiceId: it.invoiceId, sentBy: actor?.uid || null });
      lastOutbox = r.outboxId;
      if (r.status === 'SENT') ok = true;
    }
    if (ok) { sent += 1; await logSent(it, lastOutbox, today); } else failed += 1;
  }
  if (actor) await writeAudit({ user: actor, action: 'RUN_FEE_REMINDERS', entity: 'messaging_settings', after: { sent, failed, total: items.length }, req }).catch(() => {});
  return { ran: true, sent, failed, total: items.length };
}

async function markManuallySent(body, actor) {
  const { invoiceId, installmentId = null, kind, to, text, studentId } = body || {};
  if (!invoiceId || !kind || !to || !text) throw new AppError('invoiceId, kind, to and text are required.');
  const outboxId = await messaging.recordManual({ to, body: text, studentId, invoiceId, sentBy: actor.uid });
  await logSent({ invoiceId, installmentId, kind }, outboxId, todayInSchoolTz());
  return { ok: true };
}

async function outbox(limit = 200) {
  const { rows } = await query(
    `SELECT o.id, o.kind, o.channel, o.to_phone, o.body, o.status, o.provider, o.error, o.created_at, s.first_name, s.last_name, u.name AS sent_by_name
     FROM message_outbox o LEFT JOIN students s ON s.id = o.student_id LEFT JOIN users u ON u.id = o.sent_by
     WHERE o.kind <> 'OTP' ORDER BY o.created_at DESC LIMIT $1`, [Math.min(Number(limit) || 200, 500)]);
  return rows;
}

// ------------------------------------------------------------ instalment schedules (template per fee structure)
async function listInstallments(feeStructureId) {
  const { rows: fs } = await query('SELECT id, total FROM fee_structures WHERE id = $1', [feeStructureId]);
  if (!fs.length) throw new AppError('Fee structure not found.', 404);
  const { rows } = await query(`SELECT id, name, amount, to_char(due_date,'YYYY-MM-DD') AS due_date, sort_order FROM fee_installments WHERE fee_structure_id = $1 ORDER BY sort_order, due_date`, [feeStructureId]);
  return { total: Number(fs[0].total), items: rows.map((r) => ({ ...r, amount: Number(r.amount) })) };
}

async function replaceInstallments(feeStructureId, items, actor, req) {
  const { total, items: before } = await listInstallments(feeStructureId);
  if (!Array.isArray(items)) throw new AppError('items must be a list.');
  if (items.length > 12) throw new AppError('At most 12 instalments.');
  const clean = items.map((it, i) => {
    const name = String(it.name || '').trim(); const amount = Number(it.amount); const due = String(it.dueDate || '').slice(0, 10);
    if (!name || name.length > 80) throw new AppError(`Instalment ${i + 1}: enter a name.`);
    if (!(amount > 0)) throw new AppError(`Instalment ${i + 1}: enter an amount.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due))) throw new AppError(`Instalment ${i + 1}: enter a valid due date.`);
    return { name, amount, due, sort: i };
  });
  if (clean.length) {
    const sum = clean.reduce((s, c) => s + c.amount, 0);
    if (Math.round(sum) !== Math.round(total)) throw new AppError(`The instalments add up to ${money(sum)} FCFA but the total fee is ${money(total)} FCFA. They must match exactly.`);
  }
  await withTransaction(async (client) => {
    await client.query('DELETE FROM fee_installments WHERE fee_structure_id = $1', [feeStructureId]);
    for (const c of clean) await client.query('INSERT INTO fee_installments (fee_structure_id, name, amount, due_date, sort_order, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [feeStructureId, c.name, c.amount, c.due, c.sort, actor.uid]);
  });
  await writeAudit({ user: actor, action: 'UPDATE_INSTALLMENT_TEMPLATE', entity: 'fee_structures', entityId: feeStructureId, before: { items: before }, after: { items: clean }, req }).catch(() => {});
  return listInstallments(feeStructureId);
}

/** Explicit, deliberate: copy the template onto existing invoices that have NO schedule yet. Invoices that already have one are never touched. */
async function applyTemplateToExistingInvoices(feeStructureId, actor, req) {
  const { items } = await listInstallments(feeStructureId);
  if (!items.length) throw new AppError('Save an instalment schedule for this fee first.');
  const result = await query(
    `INSERT INTO invoice_installments (invoice_id, name, amount, due_date, sort_order)
     SELECT i.id, f.name, f.amount, f.due_date, f.sort_order
     FROM invoices i JOIN fee_installments f ON f.fee_structure_id = i.fee_structure_id
     WHERE i.fee_structure_id = $1 AND NOT EXISTS (SELECT 1 FROM invoice_installments x WHERE x.invoice_id = i.id)`, [feeStructureId]);
  await writeAudit({ user: actor, action: 'APPLY_INSTALLMENTS_TO_EXISTING_INVOICES', entity: 'fee_structures', entityId: feeStructureId, after: { rowsCreated: result.rowCount }, req }).catch(() => {});
  return { rowsCreated: result.rowCount };
}

module.exports = { getSettings, updateSettings, preview, run, markManuallySent, outbox, listInstallments, replaceInstallments, applyTemplateToExistingInvoices, todayInSchoolTz };
