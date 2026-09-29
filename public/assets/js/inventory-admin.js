import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { formatCurrency, formatDateTime, qs } from './utils.js';

let products = [];

async function load() {
  products = await api.get('/business/products');
  renderTable(qs('#tableMount'), products, [
    { key: 'name', label: 'Product' },
    { key: 'category', label: 'Category', render: (r) => r.category || '—' },
    { key: 'quantity_on_hand', label: 'In Stock', render: (r) => `${r.quantity_on_hand} ${r.unit}` },
    { key: 'minimum_stock', label: 'Min. Stock', render: (r) => (Number(r.quantity_on_hand) <= Number(r.minimum_stock) ? `<span class="badge badge-danger">${r.minimum_stock} — LOW</span>` : r.minimum_stock) },
    { key: 'purchase_price', label: 'Purchase Price', render: (r) => formatCurrency(r.purchase_price) },
    { key: 'selling_price', label: 'Selling Price', render: (r) => formatCurrency(r.selling_price) },
    { key: 'stock_value', label: 'Stock Value', render: (r) => formatCurrency(Number(r.quantity_on_hand) * Number(r.purchase_price)) },
    { key: 'actions', label: '', render: (r) => `<button class="btn btn-sm btn-outline" data-purchase="${r.id}" data-name="${r.name}">Record Purchase</button> <button class="btn btn-sm btn-ghost" data-history="${r.id}" data-name="${r.name}">History</button>` },
  ], { emptyMessage: 'No products yet — add one to start tracking stock.' });

  const totalValue = products.reduce((s, p) => s + Number(p.quantity_on_hand) * Number(p.purchase_price), 0);
  const lowStockCount = products.filter((p) => Number(p.quantity_on_hand) <= Number(p.minimum_stock)).length;
  qs('#summaryBanner').textContent = `${products.length} product${products.length === 1 ? '' : 's'} · Stock value: ${formatCurrency(totalValue)} · ${lowStockCount} low on stock`;

  qs('#tableMount').onclick = (e) => {
    const buyBtn = e.target.closest('[data-purchase]');
    if (buyBtn) {
      openFormModal({
        title: `Record Stock Purchase — ${buyBtn.dataset.name}`,
        submitLabel: 'Save Purchase',
        fields: [
          { name: 'quantity', label: 'Quantity Received', type: 'number', required: true },
          { name: 'unitCost', label: 'Unit Cost (FCFA) — leave blank to use current purchase price' , type: 'number'},
          { name: 'supplier', label: 'Supplier' },
        ],
        onSubmit: async (v) => {
          await api.post(`/business/products/${buyBtn.dataset.purchase}/purchase`, {
            quantity: Number(v.quantity), unitCost: v.unitCost ? Number(v.unitCost) : undefined, supplier: v.supplier || undefined,
          });
          await load();
        },
      });
      return;
    }
    const histBtn = e.target.closest('[data-history]');
    if (histBtn) showHistory(histBtn.dataset.history, histBtn.dataset.name);
  };
}

async function showHistory(productId, name) {
  const moves = await api.get(`/business/products/${productId}/movements`);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">
    <div class="modal-head"><h3>Stock History — ${name}</h3><button class="btn btn-ghost btn-sm" data-close>&times;</button></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Quantity</th><th>Notes</th></tr></thead><tbody>
      ${moves.map((m) => `<tr><td>${formatDateTime(m.created_at)}</td><td>${m.type}</td><td>${m.quantity > 0 ? '+' : ''}${m.quantity}</td><td>${m.notes || m.reference || '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="text-muted">No stock movements yet.</td></tr>'}
    </tbody></table></div>
  </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.closest('[data-close]')) backdrop.remove(); });
}

async function main() {
  await initPortalLayout({ portal: ['MANAGER', 'ACCOUNTANT'], activeKey: 'inventory' });

  qs('#pageActions').innerHTML = `<button id="addProductBtn" class="btn btn-primary">Add Product</button>`;
  qs('#pageRoot').innerHTML = '<div class="text-muted" id="summaryBanner" style="margin-bottom:12px;"></div><div id="tableMount"></div>';
  await load();

  qs('#addProductBtn').addEventListener('click', () => openFormModal({
    title: 'Add Product',
    submitLabel: 'Save Product',
    fields: [
      { name: 'name', label: 'Product Name', required: true },
      { name: 'category', label: 'Category' },
      { name: 'unit', label: 'Unit (e.g. piece, pack, box)' },
      { name: 'purchasePrice', label: 'Purchase Price (FCFA)', type: 'number' },
      { name: 'sellingPrice', label: 'Selling Price (FCFA)', type: 'number' },
      { name: 'quantityOnHand', label: 'Opening Quantity', type: 'number' },
      { name: 'minimumStock', label: 'Minimum Stock Level', type: 'number' },
      { name: 'supplier', label: 'Supplier' },
    ],
    onSubmit: async (v) => {
      await api.post('/business/products', {
        ...v,
        purchasePrice: Number(v.purchasePrice) || 0,
        sellingPrice: Number(v.sellingPrice) || 0,
        quantityOnHand: Number(v.quantityOnHand) || 0,
        minimumStock: Number(v.minimumStock) || 0,
      });
      await load();
    },
  }));
}
main();
