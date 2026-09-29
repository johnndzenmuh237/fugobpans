import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatCurrency, escapeHtml, qs } from './utils.js';

function toISO(d) { return d.toISOString().slice(0, 10); }
function todayISO() { return toISO(new Date()); }

function quickRange(key) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case 'today': return { from: todayISO(), to: todayISO() };
    case 'week': {
      const d = new Date(now); d.setDate(now.getDate() - now.getDay());
      return { from: toISO(d), to: todayISO() };
    }
    case 'month': return { from: toISO(new Date(y, m, 1)), to: todayISO() };
    case 'prevMonth': return { from: toISO(new Date(y, m - 1, 1)), to: toISO(new Date(y, m, 0)) };
    case 'year': return { from: `${y}-01-01`, to: todayISO() };
    case 'prevYear': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default: return { from: todayISO(), to: todayISO() };
  }
}

function renderStatement(mount, s) {
  mount.innerHTML = `
    <div class="card card-pad" style="margin-bottom:18px;">
      <h3 style="margin-top:0;">Income (${s.from} → ${s.to})</h3>
      <div class="invoice-summary" style="grid-template-columns:repeat(4,1fr);">
        <div class="item"><div class="text-muted">School Fees</div><div class="amt">${formatCurrency(s.income.schoolFees)}</div></div>
        <div class="item"><div class="text-muted">Sales (cash received)</div><div class="amt">${formatCurrency(s.income.sales)}</div></div>
        <div class="item"><div class="text-muted">Debt Collections</div><div class="amt">${formatCurrency(s.income.debtCollections)}</div></div>
        <div class="item"><div class="text-muted"><strong>Total Income</strong></div><div class="amt"><strong>${formatCurrency(s.income.total)}</strong></div></div>
      </div>
    </div>
    <div class="card card-pad" style="margin-bottom:18px;">
      <h3 style="margin-top:0;">Expenses</h3>
      <div class="table-wrap"><table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>
        ${s.expenses.byCategory.map((c) => `<tr><td>${escapeHtml(c.category)}</td><td>${formatCurrency(c.total)}</td></tr>`).join('') || '<tr><td colspan="2" class="text-muted">No operating expenses in this period.</td></tr>'}
        <tr><td>Salaries Paid</td><td>${formatCurrency(s.expenses.salariesPaid)}</td></tr>
        <tr><td><strong>Total Expenses</strong></td><td><strong>${formatCurrency(s.expenses.total)}</strong></td></tr>
      </tbody></table></div>
    </div>
    <div class="card card-pad" style="text-align:center;">
      <h3 style="margin-top:0;">Net ${s.netProfitLoss >= 0 ? 'Profit' : 'Loss'}</h3>
      <div class="amt" style="font-size:2rem;color:${s.netProfitLoss >= 0 ? 'var(--success, #1a7f37)' : 'var(--danger, #c62828)'};">${formatCurrency(Math.abs(s.netProfitLoss))}</div>
    </div>`;
}

async function loadStatement(from, to) {
  const mount = qs('#statementRoot');
  mount.innerHTML = '<div class="spinner"></div>';
  try {
    const s = await api.get(`/business/income-statement?from=${from}&to=${to}`);
    renderStatement(mount, s);
  } catch { mount.innerHTML = '<div class="empty-state">Could not load the income statement.</div>'; }
}

async function loadYearly(year) {
  const mount = qs('#yearlyRoot');
  mount.innerHTML = '<div class="spinner"></div>';
  try {
    const data = await api.get(`/business/reports/yearly?year=${year}`);
    mount.innerHTML = `
      <div class="table-wrap"><table><thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Profit/Loss</th></tr></thead><tbody>
        ${data.monthly.map((m) => `<tr><td>${m.period}</td><td>${formatCurrency(m.income.total)}</td><td>${formatCurrency(m.expenses.total)}</td><td>${formatCurrency(m.netProfitLoss)}</td></tr>`).join('')}
        <tr><td><strong>Year Total</strong></td><td><strong>${formatCurrency(data.overall.income.total)}</strong></td><td><strong>${formatCurrency(data.overall.expenses.total)}</strong></td><td><strong>${formatCurrency(data.overall.netProfitLoss)}</strong></td></tr>
      </tbody></table></div>`;
  } catch { mount.innerHTML = '<div class="empty-state">Could not load the yearly report.</div>'; }
}

async function main() {
  await initPortalLayout({ portal: ['MANAGER', 'ACCOUNTANT'], activeKey: 'income-statement' });

  const thisYear = new Date().getFullYear();
  qs('#pageRoot').innerHTML = `
    <div class="card card-pad" style="margin-bottom:18px;display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
      <div class="field"><label>Quick Range</label>
        <select id="rangeSelect">
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month" selected>This Month</option>
          <option value="prevMonth">Previous Month</option>
          <option value="year">This Year</option>
          <option value="prevYear">Previous Year</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>
      <div class="field" id="customFrom" style="display:none;"><label>From</label><input type="date" id="fromInput" /></div>
      <div class="field" id="customTo" style="display:none;"><label>To</label><input type="date" id="toInput" /></div>
      <button id="applyBtn" class="btn btn-primary">Apply</button>
    </div>
    <div id="statementRoot"><div class="spinner"></div></div>

    <h2 style="margin-top:36px;">Yearly Breakdown</h2>
    <div class="card card-pad" style="margin-bottom:18px;display:flex;gap:10px;align-items:end;">
      <div class="field"><label>Year</label><input type="number" id="yearInput" value="${thisYear}" style="width:120px;" /></div>
      <button id="yearBtn" class="btn btn-outline">View Year</button>
    </div>
    <div id="yearlyRoot"><div class="spinner"></div></div>
  `;

  const initial = quickRange('month');
  await loadStatement(initial.from, initial.to);
  await loadYearly(thisYear);

  qs('#rangeSelect').addEventListener('change', (e) => {
    const isCustom = e.target.value === 'custom';
    qs('#customFrom').style.display = isCustom ? 'block' : 'none';
    qs('#customTo').style.display = isCustom ? 'block' : 'none';
  });

  qs('#applyBtn').addEventListener('click', async () => {
    const key = qs('#rangeSelect').value;
    if (key === 'custom') {
      const from = qs('#fromInput').value; const to = qs('#toInput').value;
      if (!from || !to) return;
      await loadStatement(from, to);
    } else {
      const r = quickRange(key);
      await loadStatement(r.from, r.to);
    }
  });

  qs('#yearBtn').addEventListener('click', () => loadYearly(qs('#yearInput').value));
}
main();
