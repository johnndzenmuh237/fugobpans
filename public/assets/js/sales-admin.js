import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable } from './crud-table.js';
import { formatCurrency, formatDate, statusBadge, escapeHtml, toast, qs } from './utils.js';

let products = [];

async function load() {
  const rows = await api.get('/business/sales');
  renderTable(qs('#tableMount'), rows, [
    { key: 'sale_number', label: 'Sale #' },
    { key: 'sale_date', label: 'Date', render: (r) => formatDate(r.sale_date) },
    { key: 'customer_name', label: 'Customer' },
    { key: 'total_amount', label: 'Total', render: (r) => formatCurrency(r.total_amount) },
    { key: 'amount_paid', label: 'Paid', render: (r) => formatCurrency(r.amount_paid) },
    { key: 'balance', label: 'Balance', render: (r) => formatCurrency(r.balance) },
    { key: 'status', label: 'Status', render: (r) => statusBadge(r.status) },
    { key: 'actions', label: '', render: (r) => `<button class="btn btn-sm btn-ghost" data-view="${r.id}">Items</button>` },
  ], { emptyMessage: 'No sales recorded yet.' });

  const totalRevenue = rows.reduce((s, r) => s + Number(r.total_amount), 0);
  const totalCollected = rows.reduce((s, r) => s + Number(r.amount_paid), 0);
  qs('#summaryBanner').textContent = `${rows.length} sale${rows.length === 1 ? '' : 's'} · Total value: ${formatCurrency(totalRevenue)} · Collected: ${formatCurrency(totalCollected)}`;

  qs('#tableMount').onclick = async (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    const items = await api.get(`/business/sales/${btn.dataset.view}/items`);
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal">
      <div class="modal-head"><h3>Sale Items</h3><button class="btn btn-ghost btn-sm" data-close>&times;</button></div>
      <div class="table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr></thead><tbody>
        ${items.map((it) => `<tr><td>${escapeHtml(it.product_name)}</td><td>${it.quantity}</td><td>${formatCurrency(it.unit_price)}</td><td>${formatCurrency(it.line_total)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop || ev.target.closest('[data-close]')) backdrop.remove(); });
  };
}

function openSaleModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">
    <div class="modal-head"><h3>Record a Sale</h3><button class="btn btn-ghost btn-sm" data-close>&times;</button></div>
    <form id="saleForm">
      <div class="form-grid">
        <div class="field"><label>Customer Name</label><input name="customerName" value="Walk-in customer" /></div>
        <div class="field"><label>Customer Phone</label><input name="customerPhone" /></div>
      </div>
      <h4>Items</h4>
      <div id="itemRows"></div>
      <button type="button" id="addRowBtn" class="btn btn-outline btn-sm" style="margin:8px 0;">+ Add Item</button>
      <div class="form-grid">
        <div class="field"><label>Payment Method</label>
          <select name="paymentMethod"><option value="CASH">Cash</option><option value="MOMO">Mobile Money</option><option value="BANK">Bank</option></select>
        </div>
        <div class="field"><label>Amount Paid Now (FCFA)</label><input name="amountPaid" type="number" placeholder="Leave blank = full amount" /></div>
        <div class="field"><label>Due Date (if credit)</label><input name="dueDate" type="date" /></div>
      </div>
      <div class="text-muted" style="margin:8px 0;">Total: <strong id="saleTotal">0 FCFA</strong></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button type="button" class="btn btn-outline" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Sale</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

  const rowsEl = backdrop.querySelector('#itemRows');
  const totalEl = backdrop.querySelector('#saleTotal');
  const productOptions = products.map((p) => `<option value="${p.id}" data-price="${p.selling_price}">${escapeHtml(p.name)} (${p.quantity_on_hand} in stock)</option>`).join('');

  function addRow() {
    const row = document.createElement('div');
    row.className = 'form-grid';
    row.style.gridTemplateColumns = '2fr 1fr 1fr auto';
    row.innerHTML = `
      <div class="field"><select class="item-product"><option value="">Select product…</option>${productOptions}</select></div>
      <div class="field"><input class="item-qty" type="number" placeholder="Qty" min="1" value="1" /></div>
      <div class="field"><input class="item-price" type="number" placeholder="Unit Price" /></div>
      <div class="field"><button type="button" class="btn btn-ghost btn-sm remove-row">&times;</button></div>`;
    rowsEl.appendChild(row);
    const select = row.querySelector('.item-product');
    const priceInput = row.querySelector('.item-price');
    select.addEventListener('change', () => {
      const opt = select.selectedOptions[0];
      if (opt?.dataset.price) priceInput.value = opt.dataset.price;
      recalcTotal();
    });
    row.querySelector('.item-qty').addEventListener('input', recalcTotal);
    priceInput.addEventListener('input', recalcTotal);
    row.querySelector('.remove-row').addEventListener('click', () => { row.remove(); recalcTotal(); });
  }
  function recalcTotal() {
    let total = 0;
    rowsEl.querySelectorAll('.form-grid').forEach((row) => {
      const qty = Number(row.querySelector('.item-qty').value) || 0;
      const price = Number(row.querySelector('.item-price').value) || 0;
      total += qty * price;
    });
    totalEl.textContent = formatCurrency(total);
  }
  addRow();
  backdrop.querySelector('#addRowBtn').addEventListener('click', addRow);

  backdrop.querySelector('#saleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const items = [];
    rowsEl.querySelectorAll('.form-grid').forEach((row) => {
      const productId = row.querySelector('.item-product').value;
      const quantity = Number(row.querySelector('.item-qty').value);
      const unitPrice = Number(row.querySelector('.item-price').value);
      if (productId && quantity > 0) items.push({ productId, quantity, unitPrice });
    });
    if (!items.length) { toast('Add at least one item.', 'error'); return; }
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      await api.post('/business/sales', {
        customerName: values.customerName, customerPhone: values.customerPhone,
        paymentMethod: values.paymentMethod, amountPaid: values.amountPaid ? Number(values.amountPaid) : undefined,
        dueDate: values.dueDate || undefined, items,
      });
      close();
      await load();
      toast('Sale recorded.', 'success');
    } catch (err) { toast(err.message || 'Could not record sale.', 'error'); }
  });
}

async function main() {
  await initPortalLayout({ portal: ['MANAGER', 'ACCOUNTANT'], activeKey: 'sales' });
  products = await api.get('/business/products');

  qs('#pageActions').innerHTML = `<button id="addSaleBtn" class="btn btn-primary">Record Sale</button>`;
  qs('#pageRoot').innerHTML = '<div class="text-muted" id="summaryBanner" style="margin-bottom:12px;"></div><div id="tableMount"></div>';
  await load();

  qs('#addSaleBtn').addEventListener('click', () => {
    if (!products.length) { toast('Add at least one product in Inventory first.', 'error'); return; }
    openSaleModal();
  });
}
main();
