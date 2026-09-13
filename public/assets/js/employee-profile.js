import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatCurrency, formatDate, escapeHtml, toast, qs } from './utils.js';
import { openFormModal } from './crud-table.js';

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'employees' });
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { qs('#pageRoot').innerHTML = '<div class="empty-state">No worker selected.</div>'; return; }

  const e = await api.get(`/employees/${id}`);
  qs('#pageActions').innerHTML = `<button id="createLoginBtn" class="btn btn-outline">Create Portal Login</button> <button id="salaryBtn" class="btn btn-primary">Update Salary</button>`;
  qs('#pageRoot').innerHTML = `
    <div class="card card-pad" style="margin-bottom:20px;display:flex;gap:20px;flex-wrap:wrap;align-items:center;">
      <span class="avatar" style="width:64px;height:64px;font-size:1.3rem;">${(e.first_name || '?')[0]}${(e.last_name || '')[0] || ''}</span>
      <div><h2 style="margin-bottom:4px;">${escapeHtml(e.first_name)} ${escapeHtml(e.last_name)}</h2><div class="mono text-muted">${e.employee_code} · ${escapeHtml(e.position_name)}</div></div>
    </div>
    <div class="form-grid">
      <div class="card card-pad"><h3>Contact</h3><p><strong>Phone:</strong> ${escapeHtml(e.phone)}</p><p><strong>WhatsApp:</strong> ${escapeHtml(e.whatsapp || '—')}</p><p><strong>Email:</strong> ${escapeHtml(e.email || '—')}</p></div>
      <div class="card card-pad"><h3>Employment</h3><p><strong>Start date:</strong> ${formatDate(e.start_date)}</p><p><strong>Type:</strong> ${e.employment_type}</p><p><strong>Status:</strong> ${e.status}</p></div>
      <div class="card card-pad form-row-full"><h3>Salary History</h3>
        <div class="table-wrap"><table><thead><tr><th>Effective</th><th>Basic</th><th>Net</th></tr></thead><tbody>
          ${e.salaryHistory.map((h) => `<tr><td>${formatDate(h.effective_date)}</td><td>${formatCurrency(h.basic_salary)}</td><td>${formatCurrency(h.net_salary)}</td></tr>`).join('') || '<tr><td colspan="3"><div class="empty-state">No salary set yet.</div></td></tr>'}
        </tbody></table></div>
      </div>
    </div>`;

  qs('#salaryBtn').addEventListener('click', () => openFormModal({
    title: 'Update Salary (history preserved — spec §59)',
    fields: [
      { name: 'basicSalary', label: 'Basic Salary (FCFA)', type: 'number', required: true },
      { name: 'allowances', label: 'Allowances (FCFA)', type: 'number' },
      { name: 'deductions', label: 'Deductions (FCFA)', type: 'number' },
    ],
    onSubmit: async (v) => { await api.post('/payroll/salary', { employeeId: id, basicSalary: Number(v.basicSalary), allowances: Number(v.allowances) || 0, deductions: Number(v.deductions) || 0 }); toast('Salary updated.', 'success'); location.reload(); },
  }));

  qs('#createLoginBtn').addEventListener('click', () => openFormModal({
    title: 'Create Portal Login',
    fields: [
      { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'password', label: 'Temporary Password', required: true },
      { name: 'role', label: 'Role', type: 'select', required: true, options: [{ value: 'TEACHER', label: 'Teacher' }, { value: 'EMPLOYEE', label: 'Employee' }, { value: 'ACCOUNTANT', label: 'Accountant' }] },
    ],
    onSubmit: async (v) => { await api.post(`/employees/${id}/login`, v); toast('Login created.', 'success'); },
  }));
}
main();
