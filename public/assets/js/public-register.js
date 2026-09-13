const API = window.APP_CONFIG.API_BASE_URL;
let lastInvoice = null;

async function loadClasses() {
  const classes = await fetch(`${API}/academics/classes`).then((r) => r.json());
  const select = document.getElementById('classSelect');
  select.innerHTML = '<option value="">Select…</option>' + classes.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  const preselect = new URLSearchParams(location.search).get('classId');
  if (preselect) select.value = preselect;
}

async function main() {
  await loadClasses();

  document.getElementById('regForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    const body = Object.fromEntries(new FormData(e.target).entries());

    try {
      const res = await fetch(`${API}/registrations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed.');

      lastInvoice = data.invoice;
      document.getElementById('regForm').classList.add('hidden');
      document.getElementById('successPanel').classList.remove('hidden');
      document.getElementById('regNumber').textContent = data.registrationNumber;
      document.getElementById('studentCode').textContent = data.studentCode;
      document.getElementById('className').textContent = data.className;
      document.getElementById('invoiceTotal').textContent = `${Number(data.invoice.totalAmount).toLocaleString()} FCFA`;
    } catch (err) {
      alert(err.message || 'Something went wrong. Please try again.');
      btn.disabled = false;
      btn.textContent = 'Submit Registration';
    }
  });

  document.getElementById('payNowBtn').addEventListener('click', () => openPayModal());
}

function openPayModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-head"><h3>Pay School Fees</h3><button class="btn btn-ghost btn-sm" data-close>&times;</button></div>
      <form id="payForm">
        <div class="field"><label>Amount (FCFA)</label><input name="amount" type="number" min="1" value="${lastInvoice.totalAmount}" required /></div>
        <div class="field"><label>Mobile Money number (MTN or Orange)</label><input name="phone" placeholder="6XX XXX XXX" required /></div>
        <button type="submit" class="btn btn-accent btn-block">Send Payment Prompt</button>
      </form>
      <div id="payStatus" class="text-muted" style="margin-top:14px;text-align:center;"></div>
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector('[data-close]').addEventListener('click', close);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });

  backdrop.querySelector('#payForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const statusEl = backdrop.querySelector('#payStatus');
    e.target.querySelector('button').disabled = true;
    statusEl.textContent = 'Sending payment prompt to your phone…';
    try {
      const res = await fetch(`${API}/payments/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: lastInvoice.id, amount: Number(fd.amount), phone: fd.phone }) });
      const initiation = await res.json();
      if (!res.ok) throw new Error(initiation.error);
      statusEl.textContent = 'Approve the prompt on your phone now. Waiting for confirmation…';
      pollForSuccess(initiation.providerReference, statusEl, close);
    } catch (err) {
      statusEl.textContent = err.message || 'Could not start the payment.';
      e.target.querySelector('button').disabled = false;
    }
  });
}

async function pollForSuccess(providerReference, statusEl, close) {
  for (let i = 0; i < 24; i += 1) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await fetch(`${API}/payments/verify/${providerReference}?invoiceId=${lastInvoice.id}`);
      const result = await res.json();
      if (result.status === 'SUCCESSFUL') { statusEl.textContent = '✅ Payment confirmed!'; setTimeout(close, 1200); return; }
      if (result.status === 'FAILED') { statusEl.textContent = '❌ Payment failed. Please try again.'; return; }
    } catch { /* keep polling */ }
  }
  statusEl.textContent = 'Still waiting — you can close this and pay at the office if needed.';
}

main();
