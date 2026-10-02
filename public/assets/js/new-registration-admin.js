import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { formatCurrency, qs } from './utils.js';

async function loadClasses() {
  const classes = await api.get('/academics/classes');
  const select = qs('#classSelect');
  select.innerHTML = '<option value="">Select…</option>' + classes.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
}

function resetForm() {
  qs('#regForm').reset();
  qs('#regForm').classList.remove('hidden');
  qs('#successPanel').classList.add('hidden');
  const btn = qs('#submitBtn');
  btn.disabled = false;
  btn.textContent = 'Submit Registration';
}

async function main() {
  await initPortalLayout({ portal: ['MANAGER', 'ACCOUNTANT'], activeKey: 'new-registration' });
  await loadClasses();

  qs('#regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#submitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    const body = Object.fromEntries(new FormData(e.target).entries());

    try {
      const data = await api.post('/registrations/staff', body);
      qs('#regForm').classList.add('hidden');
      qs('#successPanel').classList.remove('hidden');
      qs('#regNumber').textContent = data.registrationNumber;
      qs('#studentCode').textContent = data.studentCode;
      qs('#trackingCode').textContent = data.trackingCode;
      qs('#className').textContent = data.className;
      qs('#invoiceTotal').textContent = `${Number(data.invoice.totalAmount).toLocaleString()} FCFA`;
    } catch {
      // api.post already shows a toast with the server's error message.
      btn.disabled = false;
      btn.textContent = 'Submit Registration';
    }
  });

  qs('#registerAnotherBtn').addEventListener('click', resetForm);
}
main();
