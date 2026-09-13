import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatCurrency, qs } from './utils.js';

async function main() {
  const profile = await initPortalLayout({ portal: 'ACCOUNTANT', activeKey: 'dashboard' });
  qs('#pageRoot').innerHTML = `<div class="welcome-banner"><h1>Welcome, ${profile.name}!</h1></div><div class="stat-grid" id="statGrid"><div class="spinner"></div></div>
    <div class="quick-actions">
      <a class="quick-action" href="/accountant/payments.html"><span class="icon">💳</span><span class="label">Payments</span></a>
      <a class="quick-action" href="/accountant/outstanding-fees.html"><span class="icon">⚠️</span><span class="label">Outstanding Fees</span></a>
      <a class="quick-action" href="/accountant/receipts.html"><span class="icon">🧾</span><span class="label">Receipts</span></a>
    </div>`;
  try {
    const rows = await api.get('/dashboard/registrations');
    const total = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const paid = rows.reduce((s, r) => s + Number(r.amount_paid || 0), 0);
    qs('#statGrid').innerHTML = `
      <div class="stat-card"><div class="label">Expected</div><div class="value">${formatCurrency(total)}</div></div>
      <div class="stat-card"><div class="label">Collected</div><div class="value">${formatCurrency(paid)}</div></div>
      <div class="stat-card"><div class="label">Outstanding</div><div class="value">${formatCurrency(total - paid)}</div></div>`;
  } catch { qs('#statGrid').innerHTML = ''; }
}
main();
