import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatCurrency, escapeHtml, toast, qs } from './utils.js';

async function load() {
  const rows = await api.get('/academics/fee-structures');
  renderTable(qs('#tableMount'), rows, [
    { key: 'class_name', label: 'Class' },
    { key: 'session_name', label: 'Session' },
    { key: 'registration_fee', label: 'Registration Fee', render: (r) => formatCurrency(r.registration_fee) },
    { key: 'school_fee', label: 'School Fee', render: (r) => formatCurrency(r.school_fee) },
    { key: 'total', label: 'Total', render: (r) => formatCurrency(r.total) },
    { key: 'installment_allowed', label: 'Installment', render: (r) => (r.installment_allowed ? 'Yes' : 'No') },
  ]);
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'fee-structures' });
  const [classes, sessions] = await Promise.all([api.get('/academics/classes'), api.get('/academics/sessions')]);

  qs('#pageActions').innerHTML = `<button id="addSessionBtn" class="btn btn-outline">Add Session</button> <button id="addFeeBtn" class="btn btn-primary">Set Class Fees</button>`;
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  await load();

  qs('#addSessionBtn').addEventListener('click', () => openFormModal({
    title: 'Add Academic Session',
    fields: [{ name: 'name', label: 'Session name (e.g. 2026/2027)', required: true }, { name: 'startDate', label: 'Start Date', type: 'date' }, { name: 'endDate', label: 'End Date', type: 'date' }],
    onSubmit: async (v) => { await api.post('/academics/sessions', v); toast('Session created.', 'success'); },
  }));

  qs('#addFeeBtn').addEventListener('click', () => openFormModal({
    title: 'Set Fees for a Class',
    fields: [
      { name: 'classId', label: 'Class', type: 'select', required: true, options: classes.map((c) => ({ value: c.id, label: c.name })) },
      { name: 'academicSessionId', label: 'Academic Session', type: 'select', required: true, options: sessions.map((s) => ({ value: s.id, label: s.name })) },
      { name: 'registrationFee', label: 'Registration Fee (FCFA)', type: 'number', required: true },
      { name: 'schoolFee', label: 'School Fee (FCFA)', type: 'number', required: true },
      { name: 'otherFees', label: 'Other Fees (FCFA)', type: 'number' },
      { name: 'installmentAllowed', label: 'Allow Installments', type: 'select', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
    ],
    onSubmit: async (v) => {
      await api.post('/academics/fee-structures', {
        ...v, registrationFee: Number(v.registrationFee), schoolFee: Number(v.schoolFee), otherFees: Number(v.otherFees) || 0,
        installmentAllowed: v.installmentAllowed !== 'false',
      });
      toast('Fees saved.', 'success');
      load();
    },
  }));
}
main();
