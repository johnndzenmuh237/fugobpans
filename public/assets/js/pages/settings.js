import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { qs, escapeHtml, toast } from '../utils.js';
const F = [['Company', [['name', 'Company / agency name'], ['tagline', 'Tagline'], ['address', 'Address'], ['phone', 'Phone'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['website', 'Website'], ['logoUrl', 'Logo URL']]],
  ['Rent rules', [['currency', 'Currency'], ['gracePeriodDays', 'Grace period (days)', 'number'], ['lateFeePercent', 'Late fee (%)', 'number'], ['dueSoonDays', 'Warn “due soon” (days before)', 'number']]],
  ['Mobile Money payment details (shown to tenants)', [['momoMtnNumber', 'MTN MoMo number'], ['momoMtnName', 'MTN account name'], ['momoOrangeNumber', 'Orange Money number'], ['momoOrangeName', 'Orange account name'], ['paymentInstructions', 'Payment instructions'], ['supportCallNumber', 'Support / call number']]]];
const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
async function main() {
  await initPortalLayout({ activeKey: 'settings', title: 'Settings', subtitle: 'Company details, rent rules and the Mobile Money numbers tenants pay to.' });
  const s = await api.get('/settings');
  qs('#pageRoot').innerHTML = `<form id="f" class="card card-pad" style="max-width:820px">${F.map(([t, fields]) => `<fieldset><legend>${t}</legend><div class="form-grid">${fields.map(([k, l, type]) => `<div class="field"><label>${l}</label><input name="${k}" type="${type || 'text'}" ${type === 'number' ? 'step="any" min="0"' : ''} value="${escapeHtml(s[snake(k)] ?? '')}"/></div>`).join('')}</div></fieldset>`).join('')}<button class="btn btn-primary" type="submit">Save settings</button></form>`;
  qs('#f').addEventListener('submit', async (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target).entries()); ['gracePeriodDays', 'lateFeePercent', 'dueSoonDays'].forEach((k) => { if (v[k] !== '') v[k] = Number(v[k]); else delete v[k]; }); await api.patch('/settings', v); toast('Settings saved.', 'success'); });
}
main();
