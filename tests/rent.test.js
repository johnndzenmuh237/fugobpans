const assert = require('assert');
const r = require('../server/utils/rent');

test('rent engine: months paid / owing / advance, receipts, dates', () => {
// John Doe: 50,000/month from 2026-01-15, paid 4 months, today 2026-05-20 -> May cycle (05-15) due, unpaid => 1 month owing
let s = r.computeRentStatus({ monthlyRent: 50000, rentStartDate: '2026-01-15', totalPaid: 200000, today: '2026-05-20' });
assert.strictEqual(s.monthsDue, 5); assert.strictEqual(s.monthsPaid, 4); assert.strictEqual(s.monthsOwing, 1);
assert.strictEqual(s.amountOwing, 50000); assert.strictEqual(s.nextPaymentDate, '2026-05-15'); assert.strictEqual(s.status, 'OVERDUE');
// same day as cycle date -> due today
s = r.computeRentStatus({ monthlyRent: 50000, rentStartDate: '2026-01-15', totalPaid: 200000, today: '2026-05-15' });
assert.strictEqual(s.status, 'DUE_TODAY');
// 6 months paid in advance, today 2026-07-02 start 2026-07-01 -> due 1, paid 6 => advance 5
s = r.computeRentStatus({ monthlyRent: 75000, rentStartDate: '2026-07-01', totalPaid: 450000, today: '2026-07-02' });
assert.strictEqual(s.monthsAdvance, 5); assert.strictEqual(s.status, 'ADVANCE'); assert.strictEqual(s.nextPaymentDate, '2027-01-01');
// serious arrears
s = r.computeRentStatus({ monthlyRent: 30000, rentStartDate: '2026-01-31', totalPaid: 30000, today: '2026-05-01' });
assert.strictEqual(s.monthsDue, 4); // 01-31, 02-28, 03-31, 04-30
assert.strictEqual(s.monthsOwing, 3); assert.strictEqual(s.status, 'SERIOUS_ARREARS');
// partial payment: 20,000 of 50,000 in the current cycle
s = r.computeRentStatus({ monthlyRent: 50000, rentStartDate: '2026-01-01', totalPaid: 220000, today: '2026-05-10' });
assert.strictEqual(s.monthsPaid, 4); assert.strictEqual(s.amountOwing, 30000); assert.strictEqual(s.monthsOwing, 1);
// due soon
s = r.computeRentStatus({ monthlyRent: 50000, rentStartDate: '2026-01-15', totalPaid: 200000, today: '2026-05-10', dueSoonDays: 7 });
assert.strictEqual(s.status, 'DUE_SOON'); assert.strictEqual(s.daysToNext, 5);
// not started yet
s = r.computeRentStatus({ monthlyRent: 50000, rentStartDate: '2026-12-01', totalPaid: 0, today: '2026-10-01' });
assert.strictEqual(s.monthsDue, 0); assert.strictEqual(s.amountOwing, 0); assert.strictEqual(s.status, 'UP_TO_DATE');
// grace period
s = r.computeRentStatus({ monthlyRent: 50000, rentStartDate: '2026-01-15', totalPaid: 200000, today: '2026-05-18', graceDays: 5 });
assert.strictEqual(s.status, 'DUE_TODAY');
// receipt snapshot: paying 100,000 on top of 200,000 for 50,000 rent
const snap = r.computeReceiptSnapshot({ monthlyRent: 50000, rentStartDate: '2026-01-15', totalPaidBefore: 200000, amount: 100000, today: '2026-05-20' });
assert.strictEqual(snap.monthsCovered, 2); assert.strictEqual(snap.periodFrom, '2026-05-15'); assert.strictEqual(snap.periodTo, '2026-07-14');
assert.strictEqual(snap.previousBalance, 50000); assert.strictEqual(snap.remainingBalance, 0); assert.strictEqual(snap.nextPaymentDate, '2026-07-15');
// addMonths clamp + year roll
assert.strictEqual(r.addMonths('2026-01-31', 1), '2026-02-28'); assert.strictEqual(r.addMonths('2026-11-15', 3), '2027-02-15'); assert.strictEqual(r.addMonths('2024-01-31', 1), '2024-02-29');
// Date handling
assert.strictEqual(r.toISODate(new Date(2026, 8, 5)), '2026-09-05');
});
