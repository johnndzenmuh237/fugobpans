const INVOICE_STATUS = { UNPAID: 'UNPAID', PARTIALLY_PAID: 'PARTIALLY_PAID', FULLY_PAID: 'FULLY_PAID', OVERPAID: 'OVERPAID' };

function computeInvoiceStatus(total, paid) {
  const t = Number(total);
  const p = Number(paid);
  if (p <= 0) return INVOICE_STATUS.UNPAID;
  if (p < t) return INVOICE_STATUS.PARTIALLY_PAID;
  if (p === t) return INVOICE_STATUS.FULLY_PAID;
  return INVOICE_STATUS.OVERPAID;
}

function computeNetSalary({ basicSalary = 0, allowances = 0, bonuses = 0, deductions = 0 }) {
  return Math.max(Number(basicSalary) + Number(allowances) + Number(bonuses) - Number(deductions), 0);
}

function computeAttendanceRate(present, total) {
  if (!total) return 0;
  return Math.min(Math.round((present / total) * 1000) / 10, 100);
}

module.exports = { INVOICE_STATUS, computeInvoiceStatus, computeNetSalary, computeAttendanceRate };
