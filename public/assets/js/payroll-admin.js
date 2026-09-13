import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatCurrency, escapeHtml, statusBadge, toast, qs } from './utils.js';

async function loadRuns() {
  const runs = await api.get('/payroll/runs');
  qs('#runsMount').innerHTML = runs.length ? runs.map((r) => `
    <div class="card card-pad" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center;">
        <div><strong>${r.period}</strong> — ${r.employee_count} workers — Total ${formatCurrency(r.total_net)}</div>
        <div style="display:flex;gap:8px;align-items:center;">${statusBadge(r.status)}<button class="btn btn-sm btn-outline" data-view="${r.id}">View Items</button></div>
      </div>
      <div data-items-for="${r.id}" class="hidden" style="margin-top:14px;"></div>
    </div>`).join('') : '<div class="empty-state">No payroll runs yet.</div>';

  qs('#runsMount').querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', async () => {
    const panel = qs(`[data-items-for="${btn.dataset.view}"]`);
    if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
    const items = await api.get(`/payroll/runs/${btn.dataset.view}/items`);
    panel.innerHTML = `
      <div class="table-wrap"><table><thead><tr><th>Worker</th><th>Basic</th><th>Net</th><th>Status</th><th></th></tr></thead><tbody>
        ${items.map((i) => `
          <tr>
            <td>${escapeHtml(i.first_name)} ${escapeHtml(i.last_name)}</td>
            <td>${formatCurrency(i.basic_salary)}</td>
            <td><strong>${formatCurrency(i.net_salary)}</strong></td>
            <td>${statusBadge(i.status)}</td>
            <td>${i.status !== 'PAID' ? `<button class="btn btn-sm btn-primary" data-pay="${i.id}">Mark Paid</button>` : ''}</td>
          </tr>`).join('')}
      </tbody></table></div>`;
    panel.classList.remove('hidden');
    panel.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', async () => {
      await api.patch(`/payroll/items/${b.dataset.pay}/pay`, {});
      toast('Marked as paid.', 'success');
      btn.click(); btn.click();
    }));
  }));
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'payroll' });
  qs('#pageActions').innerHTML = `<button id="genBtn" class="btn btn-primary">Generate Payroll</button>`;
  qs('#pageRoot').innerHTML = '<div id="runsMount"></div>';
  await loadRuns();

  qs('#genBtn').addEventListener('click', async () => {
    const period = prompt('Enter payroll period (e.g. 2026-09):', new Date().toISOString().slice(0, 7));
    if (!period) return;
    try {
      const result = await api.post('/payroll/runs', { period });
      toast(`Payroll generated: ${result.employee_count} workers, ${Number(result.total_net).toLocaleString()} FCFA.`, 'success');
      loadRuns();
    } catch { /* handled */ }
  });
}
main();
