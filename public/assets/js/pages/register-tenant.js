import { initPortalLayout } from '../layout.js';
import { api } from '../api.js';
import { qs, escapeHtml, formatCurrency, toast } from '../utils.js';
import { lookups, param } from './_common.js';

let units = []; let selected = null;
const today = () => new Date().toISOString().slice(0, 10);
const inp = (name, label, o = {}) => `<div class="field ${o.full ? 'form-row-full' : ''}"><label>${label}</label><input name="${name}" type="${o.type || 'text'}" ${o.req ? 'required' : ''} value="${escapeHtml(o.val ?? '')}" ${o.min !== undefined ? `min="${o.min}"` : ''} ${o.ph ? `placeholder="${escapeHtml(o.ph)}"` : ''}/></div>`;

function success(r) {
  qs('#pageRoot').innerHTML = `
    <div class="card card-pad" style="max-width:640px;margin:0 auto">
      <h2 style="margin-top:0">✅ ${escapeHtml(r.tenant.name)} is registered</h2>
      <dl class="kv"><dt>Tenant ID</dt><dd class="mono">${escapeHtml(r.tenant.tenantCode)}</dd><dt>Contract</dt><dd class="mono">${escapeHtml(r.contract.contractNo)}</dd>
      <dt>Contract period</dt><dd>${String(r.contract.startDate).slice(0, 10)} → ${String(r.contract.endDate).slice(0, 10)}</dd>
      ${r.receipts.map((x) => `<dt>${x.type === 'DEPOSIT' ? 'Deposit receipt' : 'Rent receipt'}</dt><dd><a class="mono" href="/admin/receipt.html?id=${x.id}">${escapeHtml(x.receiptNumber)}</a> · ${formatCurrency(x.amount)}</dd>`).join('')}</dl>
      <div class="rent-hero" style="margin:18px 0"><div class="muted">Tenant tracking code</div><div class="big mono" style="letter-spacing:.12em">${escapeHtml(r.tenant.trackingCode)}</div>
      <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:.88rem">Give this code to the tenant. They open <strong>Tenant Portal</strong> on the website and enter it with the last 4 digits of their phone number to see their rent, receipts and announcements.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-primary" href="/admin/tenant-profile.html?id=${r.tenant.id}">Open tenant profile</a><button class="btn btn-outline" onclick="print()">Print slip</button><a class="btn btn-ghost" href="/admin/register-tenant.html">Register another</a></div>
    </div>`;
}

async function main() {
  await initPortalLayout({ activeKey: 'register-tenant', perms: ['tenants'], title: 'Register Tenant', subtitle: 'Property → House → Unit, then tenant details, then rent and contract.' });
  const props = (await lookups.properties()).filter((p) => p.kind !== 'LAND');
  const preUnit = param('unitId');
  let preProp = '';
  if (preUnit) { try { const u = await api.get(`/units/${preUnit}`); preProp = u.property_id; } catch { /* ignore */ } }

  qs('#pageRoot').innerHTML = `<form id="regForm" class="card card-pad" style="max-width:860px">
    <fieldset><legend>Step 1 — Where will the tenant live?</legend><div class="form-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="field"><label>Property</label><select id="selProp" required><option value="">Select…</option>${props.map((p) => `<option value="${p.id}" ${p.id === preProp ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>House</label><select id="selHouse" required disabled><option value="">Select property first</option></select></div>
      <div class="field"><label>Unit (vacant only)</label><select id="selUnit" name="unitId" required disabled><option value="">Select house first</option></select></div></div>
      <div id="unitInfo" class="text-muted" style="font-size:.88rem"></div></fieldset>
    <fieldset><legend>Step 2 — Tenant information</legend><div class="form-grid">
      ${inp('firstName', 'First name', { req: 1 })}${inp('lastName', 'Last name', { req: 1 })}${inp('phone', 'Phone (used for portal verification)', { req: 1, ph: '6XX XXX XXX' })}${inp('whatsapp', 'WhatsApp')}${inp('email', 'Email', { type: 'email' })}${inp('occupation', 'Occupation')}
      <div class="field"><label>ID type</label><select name="idType"><option value="">Select…</option><option>National ID card</option><option>Passport</option><option>Driver's licence</option><option>Other</option></select></div>${inp('idNumber', 'ID number')}
      ${inp('emergencyContactName', 'Emergency contact name')}${inp('emergencyContactPhone', 'Emergency contact phone')}${inp('address', 'Previous / home address', { full: 1 })}</div></fieldset>
    <fieldset><legend>Step 3 — Rent, deposit & contract</legend><div class="form-grid">
      ${inp('monthlyRent', 'Monthly rent (FCFA)', { type: 'number', req: 1, min: 1 })}${inp('securityDeposit', 'Security deposit required (FCFA)', { type: 'number', min: 0 })}
      ${inp('moveInDate', 'Move-in date', { type: 'date', val: today(), req: 1 })}${inp('rentStartDate', 'First rent due date', { type: 'date', val: today(), req: 1 })}
      ${inp('contractMonths', 'Contract duration (months)', { type: 'number', val: 12, min: 1 })}${inp('noticePeriodDays', 'Notice period (days)', { type: 'number', val: 30, min: 0 })}
      ${inp('monthsInitiallyPaid', 'Months of rent paid now', { type: 'number', val: 0, min: 0 })}${inp('depositPaid', 'Deposit paid now (FCFA)', { type: 'number', val: 0, min: 0 })}
      <div class="field"><label>Payment method</label><select name="paymentMethod"><option value="OFFICE_CASH">Cash</option><option value="MTN_MOMO">MTN Mobile Money</option><option value="ORANGE_MONEY">Orange Money</option><option value="BANK">Bank</option></select></div>${inp('transactionReference', 'Transaction ID (for Mobile Money / bank)')}
      <div class="field form-row-full"><label>Notes</label><textarea name="notes" rows="2"></textarea></div></div>
      <p class="text-muted" style="font-size:.84rem;margin:0">The system generates the Tenant ID, tracking code, contract number and a receipt number for each payment taken now.</p></fieldset>
    <button class="btn btn-primary" type="submit" id="saveBtn">Register tenant</button></form>`;

  const selProp = qs('#selProp'); const selHouse = qs('#selHouse'); const selUnit = qs('#selUnit'); const form = qs('#regForm');
  async function onProp() {
    selHouse.innerHTML = '<option value="">Loading…</option>'; selUnit.innerHTML = '<option value="">Select house first</option>'; selUnit.disabled = true; qs('#unitInfo').textContent = '';
    if (!selProp.value) { selHouse.disabled = true; selHouse.innerHTML = '<option value="">Select property first</option>'; return; }
    units = (await api.get(`/units?propertyId=${selProp.value}&status=VACANT`));
    const houses = [...new Set(units.map((u) => u.house_no))];
    selHouse.disabled = false;
    selHouse.innerHTML = houses.length ? `<option value="">Select house…</option>${houses.map((h) => `<option value="${escapeHtml(h)}">House ${escapeHtml(h)}</option>`).join('')}` : '<option value="">No vacant units here</option>';
    if (preUnit && selProp.value === preProp) { const pu = units.find((u) => u.id === preUnit); if (pu) { selHouse.value = pu.house_no; onHouse(pu.id); } }
  }
  function onHouse(presel) {
    const list = units.filter((u) => u.house_no === selHouse.value);
    selUnit.disabled = !list.length;
    selUnit.innerHTML = `<option value="">Select unit…</option>${list.map((u) => `<option value="${u.id}">Unit ${escapeHtml(u.unit_no)} — ${escapeHtml(u.category_name || 'Unit')} · ${formatCurrency(u.monthly_rent)}</option>`).join('')}`;
    if (presel) { selUnit.value = presel; onUnit(); }
  }
  function onUnit() {
    selected = units.find((u) => u.id === selUnit.value) || null;
    if (!selected) { qs('#unitInfo').textContent = ''; return; }
    qs('#unitInfo').textContent = `${selected.rooms} room(s)${selected.has_kitchen ? ' · kitchen' : ''}${selected.has_toilet || selected.has_bathroom ? ' · toilet/bath' : ''} — listed rent ${formatCurrency(selected.monthly_rent)}, deposit ${formatCurrency(selected.security_deposit)}`;
    form.monthlyRent.value = selected.monthly_rent; form.securityDeposit.value = selected.security_deposit;
  }
  selProp.addEventListener('change', onProp); selHouse.addEventListener('change', () => onHouse()); selUnit.addEventListener('change', onUnit);
  if (preProp) await onProp();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = qs('#saveBtn'); btn.disabled = true; btn.textContent = 'Registering…';
    const v = Object.fromEntries(new FormData(form).entries());
    ['monthlyRent', 'securityDeposit', 'contractMonths', 'noticePeriodDays', 'monthsInitiallyPaid', 'depositPaid'].forEach((k) => { v[k] = Number(v[k]) || 0; });
    try { success(await api.post('/tenants', v)); toast('Tenant registered.', 'success'); } catch { btn.disabled = false; btn.textContent = 'Register tenant'; }
  });
}
main();
