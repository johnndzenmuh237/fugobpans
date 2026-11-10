import { escapeHtml, formatCurrency, formatDate, statusBadge, pctBar, KIND_LABEL, PURPOSE_LABEL, KIND_ICON } from '../utils.js';
const API = window.APP_CONFIG.API_BASE_URL;
const id = new URLSearchParams(location.search).get('id');
(async () => {
  const root = document.getElementById('detail');
  try {
    const res = await fetch(`${API}/public/listings/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error();
    const p = await res.json();
    document.title = `${p.name} | ${KIND_LABEL[p.kind]}`;
    const bg = p.photo_url ? `style="background-image:url('${escapeHtml(p.photo_url)}');height:320px"` : 'style="height:240px"';
    root.innerHTML = `<a href="/listings.html" class="text-muted">&larr; All properties</a>
      <div class="two-col" style="margin-top:14px"><div>
        <div class="prop-media k-${p.kind}" ${bg} >${p.photo_url ? '' : KIND_ICON[p.kind]}<div class="tags">${statusBadge(p.construction_status)}<span class="badge badge-info">${PURPOSE_LABEL[p.purpose]}</span></div></div>
        <h1 style="margin-top:18px">${escapeHtml(p.name)}</h1>
        <div class="prop-meta" style="font-size:.95rem"><span> ${escapeHtml([p.location, p.city].filter(Boolean).join(', ') || '—')}</span>${p.size_sqm ? `<span>${Number(p.size_sqm).toLocaleString()} m²</span>` : ''}<span>${KIND_LABEL[p.kind]}${p.category_name ? ` · ${escapeHtml(p.category_name)}` : ''}</span></div>
        ${p.asking_price ? `<div class="prop-price" style="font-size:1.8rem;margin:10px 0">${formatCurrency(p.asking_price)}</div>` : ''}
        ${p.construction_status === 'UNCOMPLETED' ? `<div class="card card-pad" style="margin:14px 0"><strong>${p.completion_percent}% complete</strong>${p.expected_completion_date ? ` — expected ${formatDate(p.expected_completion_date)}` : ''}${pctBar(p.completion_percent)}</div>` : ''}
        ${p.description ? `<p style="white-space:pre-wrap">${escapeHtml(p.description)}</p>` : ''}
        ${p.vacantUnits.length ? `<h3>Available to rent</h3><div class="table-wrap"><table><thead><tr><th>House</th><th>Unit</th><th>Type</th><th>Rent / month</th><th>Deposit</th></tr></thead><tbody>${p.vacantUnits.map((u) => `<tr><td>${escapeHtml(u.house_no)}</td><td>${escapeHtml(u.unit_no)}</td><td>${escapeHtml(u.category_name || `${u.rooms} room(s)`)}</td><td>${formatCurrency(u.monthly_rent)}</td><td>${formatCurrency(u.security_deposit)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>
      <form id="enq" class="card card-pad" style="align-self:start"><h3 style="margin-top:0">Ask about this property</h3>
        <div class="field"><label>Name</label><input name="name" required/></div><div class="field"><label>Phone</label><input name="phone" required/></div>
        <div class="field"><label>I want to</label><select name="interest"><option value="VISIT">Visit it</option><option value="RENT">Rent it</option><option value="BUY">Buy it</option><option value="GENERAL">Ask a question</option></select></div>
        <div class="field"><label>Message</label><textarea name="message" rows="3"></textarea></div>
        <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true"/>
        <button class="btn btn-primary btn-block" id="enqBtn" type="submit">Send enquiry</button><div id="enqOk" class="notice-card hidden" style="margin-top:12px"></div></form></div>`;
    document.getElementById('enq').addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = document.getElementById('enqBtn'); btn.disabled = true;
      const body = Object.fromEntries(new FormData(e.target).entries()); body.propertyId = id;
      const r = await fetch(`${API}/public/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json(); const ok = document.getElementById('enqOk'); ok.classList.remove('hidden');
      ok.textContent = r.ok ? d.message : (d.error || 'Could not send.'); btn.disabled = false; if (r.ok) e.target.reset();
    });
  } catch { root.innerHTML = '<div class="empty-state card">That listing is no longer available. <a href="/listings.html">See other properties</a>.</div>'; }
})();
