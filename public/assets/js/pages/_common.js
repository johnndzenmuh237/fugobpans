import { api } from '../api.js';
import { escapeHtml, formatCurrency } from '../utils.js';

export const lookups = {
  properties: () => api.get('/properties'),
  unitCategories: () => api.get('/categories?appliesTo=UNIT'),
  propertyCategories: () => api.get('/categories?appliesTo=PROPERTY'),
  landlords: () => api.get('/landlords').catch(() => []),
};
export const param = (name) => new URLSearchParams(location.search).get(name) || '';
export const card = (label, value, { sub = '', cls = '' } = {}) => `<div class="stat-card ${cls}"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
export const money = formatCurrency;
export const propLabel = (p) => `${p.name} (${p.property_code})`;
export const unitLabel = (u) => `House ${u.house_no} · Unit ${u.unit_no}${u.category_name ? ` · ${u.category_name}` : ''}`;
export const selectHtml = (id, label, options, { all = 'All' } = {}) => `<div><label style="font-size:.72rem;text-transform:uppercase;color:var(--slate-500);font-weight:700;display:block;margin-bottom:4px">${label}</label><select id="${id}"><option value="">${all}</option>${options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
export const debounceInput = (el, fn, ms = 300) => { let t; el.addEventListener('input', () => { clearTimeout(t); t = setTimeout(fn, ms); }); };
