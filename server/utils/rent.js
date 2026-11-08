/**
 * Rent engine (spec §7). Pure functions — no database access — so the same
 * math is used by the tenant portal, the dashboards, the arrears report and
 * the receipts, and is covered by unit tests.
 *
 * Model: a tenant owes `monthlyRent` on each monthly "cycle date" starting at
 * `rentStartDate` (cycle 0), then the same day-of-month every month after.
 * Everything the tenant has paid in confirmed RENT payments is pooled:
 *
 *   monthsPaid   = floor(totalPaid / monthlyRent)
 *   monthsDue    = number of cycle dates that are <= today
 *   owing        = max(0, monthsDue*rent - totalPaid)   (money)
 *   advance      = max(0, totalPaid - monthsDue*rent)   (money)
 *   nextPayment  = cycle date of the first not-fully-paid cycle
 *
 * Dates are handled as 'YYYY-MM-DD' strings in UTC so server timezone and
 * daylight-saving never shift a due date by a day.
 */

function pad(n) { return String(n).padStart(2, '0'); }

/** Accepts Date | 'YYYY-MM-DD' | ISO string -> 'YYYY-MM-DD' (or null). Date objects use LOCAL parts (pg DATE parsing). */
function toISODate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return null;
}

function parts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m is 1-12

/** Adds whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
function addMonths(iso, n) {
  const { y, m, d } = parts(iso);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

function addDays(iso, n) {
  const { y, m, d } = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function diffDays(aIso, bIso) { // a - b in days
  const a = parts(aIso); const b = parts(bIso);
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
}

function todayISO(now = new Date()) { return toISODate(now); }

/** How many cycle dates (start, start+1m, ...) are on or before `today`. */
function cyclesDue(startIso, todayIso) {
  if (!startIso || todayIso < startIso) return 0;
  const s = parts(startIso); const t = parts(todayIso);
  let k = (t.y - s.y) * 12 + (t.m - s.m);
  if (addMonths(startIso, k) > todayIso) k -= 1;
  return Math.max(0, k + 1);
}

/**
 * @param {object} p
 * @param {number} p.monthlyRent
 * @param {string|Date} p.rentStartDate
 * @param {number} p.totalPaid     sum of SUCCESSFUL rent payments
 * @param {string|Date} [p.today]
 * @param {string|Date} [p.contractEnd]
 * @param {number} [p.dueSoonDays=7]
 * @param {number} [p.graceDays=0]  overdue only counts after the grace period
 */
function computeRentStatus({ monthlyRent, rentStartDate, totalPaid = 0, today = new Date(), contractEnd = null, dueSoonDays = 7, graceDays = 0 }) {
  const rent = Number(monthlyRent) || 0;
  const paid = Number(totalPaid) || 0;
  const start = toISODate(rentStartDate);
  const now = toISODate(today);
  const end = toISODate(contractEnd);

  const monthsDue = rent > 0 ? cyclesDue(start, now) : 0;
  const amountDue = monthsDue * rent;
  const amountOwing = Math.max(0, amountDue - paid);
  const amountAdvance = Math.max(0, paid - amountDue);
  const monthsPaid = rent > 0 ? Math.floor(paid / rent + 1e-9) : 0;
  const monthsOwing = rent > 0 ? Math.ceil(amountOwing / rent - 1e-9) : 0;
  const monthsAdvance = rent > 0 ? Math.floor(amountAdvance / rent + 1e-9) : 0;
  const nextPaymentDate = rent > 0 ? addMonths(start, monthsPaid) : start;
  const daysToNext = diffDays(nextPaymentDate, now); // negative = past due
  const monthsRemaining = end ? Math.max(0, cyclesBetween(now, end)) : null;

  let status;
  if (monthsOwing > 0) {
    const overdueDays = -daysToNext;
    if (monthsOwing >= 3) status = 'SERIOUS_ARREARS';
    else if (overdueDays === 0) status = 'DUE_TODAY';
    else if (overdueDays <= graceDays) status = 'DUE_TODAY'; // still inside the grace window
    else status = 'OVERDUE';
  } else if (monthsAdvance >= 1) status = 'ADVANCE';
  else if (daysToNext <= dueSoonDays) status = 'DUE_SOON';
  else status = 'UP_TO_DATE';

  return {
    monthlyRent: rent, totalPaid: paid, rentStartDate: start,
    monthsDue, monthsPaid, monthsOwing, monthsAdvance, monthsRemaining,
    amountDue, amountOwing, amountAdvance,
    nextPaymentDate, daysToNext, paidThroughDate: monthsPaid > 0 ? addDays(addMonths(start, monthsPaid), -1) : null,
    status,
  };
}

function cyclesBetween(fromIso, toIso) { // whole months from..to
  const f = parts(fromIso); const t = parts(toIso);
  let k = (t.y - f.y) * 12 + (t.m - f.m);
  if (addMonths(fromIso, k) > toIso) k -= 1;
  return Math.max(0, k);
}

/** Receipt snapshot for a payment of `amount` on top of `totalPaidBefore`. */
function computeReceiptSnapshot({ monthlyRent, rentStartDate, totalPaidBefore, amount, today = new Date(), dueSoonDays = 7, graceDays = 0 }) {
  const before = computeRentStatus({ monthlyRent, rentStartDate, totalPaid: totalPaidBefore, today, dueSoonDays, graceDays });
  const after = computeRentStatus({ monthlyRent, rentStartDate, totalPaid: Number(totalPaidBefore) + Number(amount), today, dueSoonDays, graceDays });
  const rent = Number(monthlyRent);
  const startIso = toISODate(rentStartDate);
  const fromIdx = Math.floor(Number(totalPaidBefore) / rent + 1e-9);
  const toIdx = Math.floor((Number(totalPaidBefore) + Number(amount)) / rent + 1e-9);
  return {
    monthsCovered: Math.round((Number(amount) / rent) * 100) / 100,
    periodFrom: addMonths(startIso, fromIdx),
    periodTo: toIdx > fromIdx ? addDays(addMonths(startIso, toIdx), -1) : addDays(addMonths(startIso, fromIdx + 1), -1),
    previousBalance: before.amountOwing,
    remainingBalance: after.amountOwing,
    nextPaymentDate: after.nextPaymentDate,
    before, after,
  };
}

module.exports = { toISODate, todayISO, addMonths, addDays, diffDays, cyclesDue, computeRentStatus, computeReceiptSnapshot };
