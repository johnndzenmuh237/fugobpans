import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { escapeHtml, toast, qs } from './utils.js';

let positions = [];
let departments = [];

async function load() {
  const rows = await api.get('/employees');
  renderTable(qs('#tableMount'), rows, [
    { key: 'name', label: 'Name', render: (r) => `<a href="/admin/employee-profile.html?id=${r.id}">${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</a>` },
    { key: 'employee_code', label: 'ID', render: (r) => `<span class="mono">${r.employee_code}</span>` },
    { key: 'position_name', label: 'Position' },
    { key: 'department_name', label: 'Department' },
    { key: 'status', label: 'Status' },
  ]);
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'employees' });
  [positions, departments] = await Promise.all([api.get('/employees/meta/positions'), api.get('/employees/meta/departments')]);

  qs('#pageActions').innerHTML = `<button id="addPosBtn" class="btn btn-outline">Add Position</button> <button id="addBtn" class="btn btn-primary">Add Worker</button>`;
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  await load();

  qs('#addPosBtn').addEventListener('click', () => openFormModal({
    title: 'Add Position', fields: [
      { name: 'name', label: 'Position (e.g. Cleaner, Security, Teacher)', required: true },
      { name: 'defaultSalary', label: 'Default Salary (FCFA)', type: 'number' },
    ],
    onSubmit: async (v) => { await api.post('/employees/meta/positions', { ...v, defaultSalary: Number(v.defaultSalary) || 0 }); toast('Position created.', 'success'); positions = await api.get('/employees/meta/positions'); },
  }));

  qs('#addBtn').addEventListener('click', () => openFormModal({
    title: 'Add Worker (any position — spec §42)',
    fields: [
      { name: 'firstName', label: 'First name', required: true },
      { name: 'lastName', label: 'Last name', required: true },
      { name: 'phone', label: 'Phone', required: true },
      { name: 'whatsapp', label: 'WhatsApp' },
      { name: 'email', label: 'Email' },
      { name: 'positionId', label: 'Position', type: 'select', required: true, options: positions.map((p) => ({ value: p.id, label: p.name })) },
      { name: 'departmentId', label: 'Department', type: 'select', options: departments.map((d) => ({ value: d.id, label: d.name })) },
      { name: 'basicSalary', label: 'Basic Salary (FCFA)', type: 'number' },
    ],
    onSubmit: async (v) => { await api.post('/employees', { ...v, basicSalary: Number(v.basicSalary) || undefined }); toast('Worker added — they now appear on Attendance automatically.', 'success'); load(); },
  }));
}
main();
