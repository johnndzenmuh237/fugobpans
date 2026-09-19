import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, formatDateTime, statusBadge, toast, qs } from './utils.js';

function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }

async function load() {
  const filter = qs('#statusFilter')?.value || '';
  const rows = await api.get(`/reviews/all${filter ? `?status=${filter}` : ''}`);

  qs('#pageRoot').innerHTML = `
    <div class="filters-bar">
      <select id="statusFilter">
        <option value="">All statuses</option>
        <option value="PENDING">Pending</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </select>
    </div>
    <div id="listMount"></div>`;
  qs('#statusFilter').value = filter;
  qs('#statusFilter').addEventListener('change', load);

  qs('#listMount').innerHTML = rows.length ? rows.map((r) => `
    <div class="card card-pad" style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="color:var(--amber-500);">${stars(r.rating)}</div>
          <strong>${escapeHtml(r.name)}</strong> <span class="text-muted" style="font-size:.8rem;">${formatDateTime(r.created_at)}</span>
        </div>
        <div>${statusBadge(r.status)} ${r.featured ? '<span class="badge badge-info">Featured</span>' : ''}</div>
      </div>
      <p style="margin-top:10px;">${escapeHtml(r.comment)}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        ${r.status !== 'APPROVED' ? `<button class="btn btn-sm btn-primary" data-approve="${r.id}">Approve</button>` : ''}
        ${r.status !== 'REJECTED' ? `<button class="btn btn-sm btn-outline" data-reject="${r.id}">Reject</button>` : ''}
        <button class="btn btn-sm btn-outline" data-feature="${r.id}::${!r.featured}">${r.featured ? 'Unfeature' : 'Feature'}</button>
        <button class="btn btn-sm btn-outline" data-edit="${r.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-delete="${r.id}">Delete</button>
      </div>
    </div>`).join('') : '<div class="empty-state">No reviews yet.</div>';

  qs('#listMount').querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', async () => { await api.patch(`/reviews/${b.dataset.approve}/moderate`, { status: 'APPROVED' }); toast('Review approved.', 'success'); load(); }));
  qs('#listMount').querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', async () => { await api.patch(`/reviews/${b.dataset.reject}/moderate`, { status: 'REJECTED' }); toast('Review rejected.', 'success'); load(); }));
  qs('#listMount').querySelectorAll('[data-feature]').forEach((b) => b.addEventListener('click', async () => {
    const [id, featured] = b.dataset.feature.split('::');
    await api.patch(`/reviews/${id}/moderate`, { featured: featured === 'true' });
    load();
  }));
  qs('#listMount').querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
    const newComment = prompt('Edit review text:');
    if (newComment === null) return;
    await api.patch(`/reviews/${b.dataset.edit}`, { comment: newComment });
    toast('Review updated.', 'success');
    load();
  }));
  qs('#listMount').querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this review permanently?')) return;
    await api.del(`/reviews/${b.dataset.delete}`);
    toast('Review deleted.', 'success');
    load();
  }));
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'reviews' });
  await load();
}
main();
