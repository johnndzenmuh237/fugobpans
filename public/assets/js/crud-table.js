import { escapeHtml, toast } from './utils.js';

export function renderTable(mountEl, rows, columns, opts = {}) {
  const pageSize = opts.pageSize || 15;
  let page = 1;
  function draw() {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(page, pages);
    const slice = rows.slice((page - 1) * pageSize, page * pageSize);
    const theadHtml = `<tr>${columns.map((c) => `<th>${c.label}</th>`).join('')}</tr>`;
    const bodyHtml = slice.length
      ? slice.map((row) => `<tr>${columns.map((c) => `<td>${c.render ? c.render(row) : escapeHtml(row[c.key] ?? '—')}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${columns.length}"><div class="empty-state">${opts.emptyMessage || 'No records found.'}</div></td></tr>`;
    mountEl.innerHTML = `<div class="table-wrap"><table><thead>${theadHtml}</thead><tbody>${bodyHtml}</tbody></table></div>
      <div class="pagination"><button data-page="prev" ${page <= 1 ? 'disabled' : ''}>&lsaquo;</button>
      <span class="text-muted" style="align-self:center;font-size:.82rem;padding:0 8px;">Page ${page} of ${pages} · ${total} record${total === 1 ? '' : 's'}</span>
      <button data-page="next" ${page >= pages ? 'disabled' : ''}>&rsaquo;</button></div>`;
    mountEl.querySelector('[data-page="prev"]')?.addEventListener('click', () => { page -= 1; draw(); });
    mountEl.querySelector('[data-page="next"]')?.addEventListener('click', () => { page += 1; draw(); });
  }
  draw();
  return { redraw: (newRows) => { rows = newRows; page = 1; draw(); } };
}

export function filterRows(rows, query, fields) {
  if (!query) return rows;
  const q = query.toLowerCase();
  return rows.filter((r) => fields.some((f) => String(r[f] ?? '').toLowerCase().includes(q)));
}

export function openFormModal({ title, fields, initial = {}, onSubmit, submitLabel = 'Save' }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">
    <div class="modal-head"><h3>${escapeHtml(title)}</h3><button class="btn btn-ghost btn-sm" data-close>&times;</button></div>
    <form id="modalForm"><div class="form-grid">
      ${fields.map((f) => `<div class="field ${f.full ? 'form-row-full' : ''}"><label for="mf_${f.name}">${f.label}</label>
        ${f.type === 'select'
          ? `<select id="mf_${f.name}" name="${f.name}" ${f.required ? 'required' : ''}><option value="">Select…</option>${(f.options || []).map((o) => `<option value="${o.value}" ${initial[f.name] === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select>`
          : f.type === 'textarea'
          ? `<textarea id="mf_${f.name}" name="${f.name}" rows="3">${escapeHtml(initial[f.name] || '')}</textarea>`
          : `<input id="mf_${f.name}" name="${f.name}" type="${f.type || 'text'}" value="${escapeHtml(initial[f.name] ?? '')}" ${f.required ? 'required' : ''} />`
        }</div>`).join('')}
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
      <button type="button" class="btn btn-outline" data-close>Cancel</button>
      <button type="submit" class="btn btn-primary">${submitLabel}</button>
    </div></form></div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  backdrop.querySelector('#modalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.target).entries());
    try { await onSubmit(values); close(); } catch (err) { toast(err.message || 'Something went wrong.', 'error'); }
  });
}
