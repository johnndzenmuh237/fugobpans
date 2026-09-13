import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatCurrency, escapeHtml, qs } from './utils.js';

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'reports' });
  const rows = await api.get('/dashboard/categories');

  const byCategory = {};
  rows.forEach((r) => {
    byCategory[r.category_name] = byCategory[r.category_name] || { classes: [], expected: 0, paid: 0, outstanding: 0, students: 0 };
    if (r.class_id) byCategory[r.category_name].classes.push(r);
    byCategory[r.category_name].expected += Number(r.expected || 0);
    byCategory[r.category_name].paid += Number(r.paid || 0);
    byCategory[r.category_name].outstanding += Number(r.outstanding || 0);
    byCategory[r.category_name].students += Number(r.student_count || 0);
  });

  qs('#pageRoot').innerHTML = Object.entries(byCategory).map(([catName, data]) => `
    <div class="card card-pad" style="margin-bottom:18px;">
      <h3>${escapeHtml(catName)}</h3>
      <div class="invoice-summary" style="grid-template-columns:repeat(4,1fr);">
        <div class="item"><div class="text-muted">Students</div><div class="amt">${data.students}</div></div>
        <div class="item"><div class="text-muted">Expected</div><div class="amt">${formatCurrency(data.expected)}</div></div>
        <div class="item"><div class="text-muted">Collected</div><div class="amt">${formatCurrency(data.paid)}</div></div>
        <div class="item"><div class="text-muted">Outstanding</div><div class="amt">${formatCurrency(data.outstanding)}</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Class</th><th>Students</th><th>Expected</th><th>Paid</th><th>Outstanding</th></tr></thead><tbody>
        ${data.classes.map((c) => `<tr><td>${escapeHtml(c.class_name)}</td><td>${c.student_count}</td><td>${formatCurrency(c.expected)}</td><td>${formatCurrency(c.paid)}</td><td>${formatCurrency(c.outstanding)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`).join('') || '<div class="empty-state">No data yet.</div>';
}
main();
