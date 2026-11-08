import { escapeHtml, toast, formatDate, formatDateTime, formatCurrency } from './utils.js';

/** Minimal modal: returns { el, close }. `html` is trusted markup built with escapeHtml by the caller. */
export function modal(title, html, { wide = false } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal" style="${wide ? 'max-width:760px;width:96%;' : ''}max-height:90vh;overflow:auto;">
    <div class="modal-head"><h3>${escapeHtml(title)}</h3><button class="btn btn-ghost btn-sm" data-close aria-label="Close">&times;</button></div>
    <div class="modal-body">${html}</div></div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return { el: backdrop, close };
}

/** Shows a one-time secret (temporary password) with a copy button. */
export function showSecret(title, intro, secret) {
  const m = modal(title, `<p>${escapeHtml(intro)}</p>
    <p style="margin:14px 0;"><code id="secretVal" style="font-size:1.15rem;padding:8px 12px;background:var(--slate-100);border-radius:8px;user-select:all;">${escapeHtml(secret)}</code></p>
    <p class="text-muted" style="font-size:.85rem;">This is shown only once and is not stored anywhere in readable form. The person must change it at first login.</p>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;"><button class="btn btn-outline" id="copySecret">Copy</button><button class="btn btn-primary" data-close>Done</button></div>`);
  m.el.querySelector('#copySecret').addEventListener('click', async () => { try { await navigator.clipboard.writeText(secret); toast('Copied.', 'success'); } catch { toast('Select the text and copy it manually.', 'error'); } });
  m.el.querySelector('[data-close].btn-primary').addEventListener('click', m.close);
  return m;
}

export function tabBar(mount, tabs, onSelect, active = tabs[0].key) {
  mount.innerHTML = `<div class="tab-bar">${tabs.map((t) => `<button type="button" data-tab="${t.key}" class="${t.key === active ? 'is-active' : ''}">${escapeHtml(t.label)}</button>`).join('')}</div>`;
  mount.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    mount.querySelectorAll('button').forEach((x) => x.classList.toggle('is-active', x === b));
    onSelect(b.dataset.tab);
  }));
  onSelect(active);
}

/** Formats a table/record value by its column name. */
export function fmtCell(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (/(^|_)(at)$/.test(key)) return escapeHtml(formatDateTime(value));
  if (/date$/.test(key)) return escapeHtml(formatDate(value));
  if (/(amount|balance|total|expected|collected|paid)/.test(key) && !isNaN(Number(value)) && !/status|method|name/.test(key)) return escapeHtml(formatCurrency(value));
  return escapeHtml(String(value).replace(/_/g, ' '));
}

export const WEEKDAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const today = () => new Date().toISOString().slice(0, 10);
export { escapeHtml, toast, formatDate, formatDateTime, formatCurrency };
