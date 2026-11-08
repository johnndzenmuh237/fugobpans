import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, statusBadge, formatDate } from './utils.js';
import { resultsHtml, wireResults, attendanceHtml, feesHtml, scheduleHtml, announcementsHtml } from './portal-sections.js';

const root = document.getElementById('pageRoot');
const TABS = [['overview', 'Overview'], ['results', 'Results & report card'], ['attendance', 'Attendance'], ['fees', 'Fees & payments'], ['schedule', 'Timetable'], ['news', 'Announcements']];
let children = [], current = null, tab = 'overview';

function pick(id) { current = children.find((c) => c.id === id) || children[0]; drawChild(); }

async function drawChild() {
  root.querySelector('#childBody').innerHTML = '<div class="spinner"></div>';
  const o = await api.get(`/parent/children/${current.id}/overview`);
  const s = o.student;
  const panels = {
    overview: () => `<div class="stat-grid"><div class="stat-link"><div class="num">${o.attendance.rate === null ? 'n/a' : o.attendance.rate + '%'}</div><div class="lbl">Attendance, last 90 days</div></div>
      <a class="stat-link" href="#fees"><div class="num">${o.fees.balance.toLocaleString()} FCFA</div><div class="lbl">Outstanding fees</div></a><div class="stat-link"><div class="num">${new Set(o.results.map((r) => r.subject_name)).size}</div><div class="lbl">Subjects with published results</div></div></div>
      <div class="card card-pad"><p><strong>Full name:</strong> ${escapeHtml(s.first_name)} ${escapeHtml(s.middle_name || '')} ${escapeHtml(s.last_name)}</p><p><strong>Admission no.:</strong> ${escapeHtml(s.student_code)}</p><p><strong>Class:</strong> ${escapeHtml(s.class_name)} · ${escapeHtml(s.session_name)}</p>
      <p><strong>Date of birth:</strong> ${formatDate(s.date_of_birth)}</p><p><strong>Guardian on record:</strong> ${escapeHtml(s.guardian_name)} · ${escapeHtml(s.guardian_phone)}</p>${o.subjects.length ? `<p><strong>Subjects:</strong> ${o.subjects.map(escapeHtml).join(', ')}</p>` : ''}
      <p style="margin-top:10px;"><a class="btn btn-outline btn-sm" href="/messages.html">Contact the school</a></p></div>`,
    results: () => resultsHtml(o.results, s.id),
    attendance: () => '<div class="spinner"></div>',
    fees: () => feesHtml(o.fees),
    schedule: () => scheduleHtml(o.timetable),
    news: () => '<div class="spinner"></div>',
  };
  const panel = root.querySelector('#childBody');
  panel.innerHTML = `<div class="welcome-banner"><h1>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</h1><p style="color:rgba(255,255,255,.85);margin:0;">${escapeHtml(s.class_name)} · ${escapeHtml(s.student_code)} · ${statusBadge(s.status)}</p></div>
    <div class="tab-bar" id="ptabs">${TABS.map(([k, l]) => `<button type="button" data-t="${k}" class="${k === tab ? 'is-active' : ''}">${l}</button>`).join('')}</div><div id="ptab" class="card card-pad"></div>`;
  async function show(k) {
    tab = k; panel.querySelectorAll('#ptabs button').forEach((b) => b.classList.toggle('is-active', b.dataset.t === k));
    const box = panel.querySelector('#ptab'); box.innerHTML = panels[k]();
    if (k === 'attendance') box.innerHTML = await attendanceHtml(s.id);
    if (k === 'news') box.innerHTML = await announcementsHtml();
    if (k === 'results') wireResults(box);
    history.replaceState(null, '', `#${k}`);
  }
  panel.querySelectorAll('#ptabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.t)));
  show(tab);
}

(async () => {
  await initPortalLayout({ portal: 'PARENT', activeKey: 'dashboard' });
  children = await api.get('/parent/children');
  const h = location.hash.replace('#', ''); if (TABS.some(([k]) => k === h)) tab = h;
  if (!children.length) { root.innerHTML = '<div class="empty-state">No children are linked to your account yet. Please contact the school office.</div>'; return; }
  root.innerHTML = `${children.length > 1 ? `<div class="field" style="max-width:320px;"><label>Child</label><select id="childSel">${children.map((c) => `<option value="${c.id}">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)} — ${escapeHtml(c.class_name)}</option>`).join('')}</select></div>` : ''}<div id="childBody"></div>`;
  root.querySelector('#childSel')?.addEventListener('change', (e) => pick(e.target.value));
  pick(children[0].id);
})();
