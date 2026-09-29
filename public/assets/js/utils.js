export function formatCurrency(amount) {
  return `${Number(amount || 0).toLocaleString('en-US')} ${window.APP_CONFIG.CURRENCY}`;
}
export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function initials(first, last) { return `${(first || '?')[0] || ''}${(last || '')[0] || ''}`.toUpperCase(); }

const STATUS_BADGE = {
  UNPAID: 'badge-danger', PARTIALLY_PAID: 'badge-warning', FULLY_PAID: 'badge-success', OVERPAID: 'badge-info',
  PENDING: 'badge-warning', CONFIRMED: 'badge-success', CANCELLED: 'badge-danger',
  ACTIVE: 'badge-success', SUSPENDED: 'badge-warning', GRADUATED: 'badge-info', WITHDRAWN: 'badge-neutral',
  PRESENT: 'badge-success', ABSENT: 'badge-danger', LATE: 'badge-warning', LEAVE: 'badge-neutral', NOT_MARKED: 'badge-neutral',
  SUCCESSFUL: 'badge-success', FAILED: 'badge-danger', PAID: 'badge-success',
  OVERDUE: 'badge-danger',
};
export function statusBadge(status) {
  const cls = STATUS_BADGE[status] || 'badge-neutral';
  return `<span class="badge ${cls}">${(status || '').replace(/_/g, ' ')}</span>`;
}
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function debounce(fn, wait = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; }
export function toast(message, type = 'info') {
  let region = document.querySelector('.toast-region');
  if (!region) { region = document.createElement('div'); region.className = 'toast-region'; document.body.appendChild(region); }
  const el = document.createElement('div');
  el.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
