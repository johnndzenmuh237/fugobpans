/**
 * Pure scheduling logic for fee reminders (no database, so it can be unit-tested).
 *
 * Inputs (all plain data):
 *   today        'YYYY-MM-DD' in the school's time zone
 *   settings     { days_before:int[], remind_on_due, overdue_every_days, max_overdue_reminders, outstanding_every_days }
 *   invoice      { id, total_amount, amount_paid }
 *   installments [{ id, name, amount, due_date:'YYYY-MM-DD', sort_order }]   (may be empty)
 *   sent         [{ installment_id|null, kind, sent_on:'YYYY-MM-DD' }]       (reminders already sent for this invoice)
 *
 * An instalment counts as covered when the invoice's total payments reach the cumulative amount due up to it,
 * so paying ahead clears later reminders, and a part-payment leaves only the unpaid remainder to chase.
 */
const dayNum = (s) => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
const ymd = (v) => String(typeof v === 'string' ? v : new Date(v).toISOString()).slice(0, 10);

function planReminders({ today, settings, invoice, installments = [], sent = [] }) {
  const balance = Number(invoice.total_amount) - Number(invoice.amount_paid);
  if (!(balance > 0)) return [];
  const out = [];
  const t = dayNum(today);
  const thresholds = [...(settings.days_before || [])].map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  const sentFor = (instId, kindPrefix) => sent.filter((s) => (s.installment_id || null) === (instId || null) && s.kind.startsWith(kindPrefix));

  if (installments.length) {
    let cumulative = 0;
    const paid = Number(invoice.amount_paid);
    [...installments].sort((a, b) => a.sort_order - b.sort_order || ymd(a.due_date).localeCompare(ymd(b.due_date))).forEach((inst) => {
      cumulative += Number(inst.amount);
      const unpaid = Math.min(Number(inst.amount), Math.max(0, cumulative - paid));
      if (!(unpaid > 0)) return;
      const due = ymd(inst.due_date);
      const daysUntil = dayNum(due) - t;
      const base = { installmentId: inst.id, installmentName: inst.name, dueDate: due, amountDue: unpaid, balance };

      if (daysUntil > 0) {
        const candidate = thresholds.find((th) => th >= daysUntil); // smallest threshold that is still ahead of us
        if (candidate !== undefined && !sentFor(inst.id, 'UPCOMING').some((s) => s.kind === `UPCOMING:${candidate}`)) {
          out.push({ ...base, kind: `UPCOMING:${candidate}`, template: 'upcoming' });
        }
      } else if (daysUntil === 0) {
        if (settings.remind_on_due && !sentFor(inst.id, 'DUE').length) out.push({ ...base, kind: 'DUE', template: 'due' });
      } else if (settings.overdue_every_days > 0) {
        const prior = sentFor(inst.id, 'OVERDUE').sort((a, b) => b.sent_on.localeCompare(a.sent_on));
        const gap = prior.length ? t - dayNum(prior[0].sent_on) : Infinity;
        if (gap >= settings.overdue_every_days && prior.length < settings.max_overdue_reminders) out.push({ ...base, kind: 'OVERDUE', template: 'overdue' });
      }
    });
    return out;
  }

  // No instalment schedule on this invoice: optional periodic "outstanding balance" nudge.
  if (settings.outstanding_every_days > 0) {
    const prior = sentFor(null, 'BALANCE').sort((a, b) => b.sent_on.localeCompare(a.sent_on));
    const gap = prior.length ? t - dayNum(prior[0].sent_on) : Infinity;
    if (gap >= settings.outstanding_every_days) out.push({ installmentId: null, installmentName: null, dueDate: null, amountDue: balance, balance, kind: 'BALANCE', template: 'balance' });
  }
  return out;
}

/** {student} {guardian} {amount} {due_date} {balance} {invoice} {school} {phone}. Unknown placeholders are left visible so mistakes are noticed. */
function renderTemplate(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
}

module.exports = { planReminders, renderTemplate, dayNum };
