import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatCurrency, qs } from './utils.js';

async function main() {
  const profile = await initPortalLayout({ portal: 'MANAGER', activeKey: 'dashboard' });
  qs('#welcomeName').textContent = profile.name || profile.email;

  const grid = qs('#statGrid');
  grid.innerHTML = '<div class="spinner"></div>';
  try {
    const d = await api.get('/dashboard/overview');
    grid.innerHTML = `
      ${card('Active Students', d.students.active)}
      ${card('New This Week', d.students.this_week)}
      ${card('Expected Fees', formatCurrency(d.finance.expected))}
      ${card('Collected', formatCurrency(d.finance.collected))}
      ${card('Outstanding', formatCurrency(d.finance.outstanding))}
      ${card('Fully Paid', d.finance.fully_paid)}
      ${card('Partially Paid', d.finance.partially_paid)}
      ${card('Unpaid', d.finance.unpaid)}
      ${card('Total Workers', d.employees.total)}
      ${card('Present Today', d.attendanceToday.present)}
      ${card('Absent Today', d.attendanceToday.absent)}
      ${card('Payroll This Month', formatCurrency(d.payrollThisMonth))}
    `;
  } catch {
    grid.innerHTML = '<div class="empty-state">Could not load dashboard data.</div>';
  }
}
function card(label, value) { return `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`; }
main();
