import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, fmtCell, tabBar, toast, modal } from './ui.js';

const root = document.getElementById('pageRoot');

async function resultsTab(box) {
  let rows = [];
  try { rows = await api.get('/results/pending?status=SUBMITTED'); } catch { box.innerHTML = '<div class="empty-state">You do not have access to result approvals.</div>'; return; }
  if (!rows.length) { box.innerHTML = '<div class="empty-state">No results are waiting for approval.</div>'; return; }
  const groups = {}; rows.forEach((r) => { (groups[`${r.class_name} · ${r.subject_name} · ${r.term}`] ||= []).push(r); });
  box.innerHTML = Object.entries(groups).map(([title, list]) => `<div class="card card-pad" style="margin-bottom:12px;">
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;"><strong>${escapeHtml(title)}</strong><span class="text-muted" style="font-size:.82rem;">entered by ${escapeHtml(list[0].entered_by_name || 'unknown')}</span></div>
    <div class="table-wrap"><table><thead><tr><th></th><th>Student</th><th>Score</th><th>Remarks</th></tr></thead><tbody>${list.map((r) => `<tr><td><input type="checkbox" class="pick" value="${r.id}" checked /></td><td>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)} <span class="text-muted">${escapeHtml(r.student_code)}</span></td><td>${r.score}/${r.max_score}</td><td>${escapeHtml(r.remarks || '')}</td></tr>`).join('')}</tbody></table></div>
    <div style="display:flex;gap:8px;margin-top:8px;"><button class="btn btn-primary btn-sm" data-decide="APPROVED">Approve &amp; publish</button><button class="btn btn-outline btn-sm" data-decide="REJECTED">Return for correction</button></div></div>`).join('');
  box.querySelectorAll('.card').forEach((card) => card.querySelectorAll('[data-decide]').forEach((b) => b.addEventListener('click', async () => {
    const ids = [...card.querySelectorAll('.pick:checked')].map((x) => x.value);
    if (!ids.length) return toast('Select at least one result.', 'error');
    let note = null;
    if (b.dataset.decide === 'REJECTED') { note = prompt('What should the teacher correct?'); if (note === null) return; }
    await api.post('/results/review', { resultIds: ids, decision: b.dataset.decide, note });
    toast(b.dataset.decide === 'APPROVED' ? 'Published to students and parents.' : 'Returned to the teacher.', 'success'); resultsTab(box);
  })));
}

async function approvedTab(box) {
  let rows = [];
  try { rows = await api.get('/results/pending?status=APPROVED'); } catch { box.innerHTML = '<div class="empty-state">No access.</div>'; return; }
  box.innerHTML = `<p class="text-muted">Published results are locked for teachers. Reopen one to send it back for correction; the previous mark is kept in the student's history.</p>
  <div class="table-wrap"><table><thead><tr><th>Class</th><th>Subject</th><th>Term</th><th>Student</th><th>Score</th><th></th></tr></thead><tbody>${rows.slice(0, 300).map((r) => `<tr><td>${escapeHtml(r.class_name)}</td><td>${escapeHtml(r.subject_name)}</td><td>${escapeHtml(r.term)}</td><td>${escapeHtml(r.first_name)} ${escapeHtml(r.last_name)}</td><td>${r.score}/${r.max_score}</td><td><button class="btn btn-outline btn-sm" data-reopen="${r.id}">Reopen</button></td></tr>`).join('') || '<tr><td colspan="6">None.</td></tr>'}</tbody></table></div>`;
  box.querySelectorAll('[data-reopen]').forEach((b) => b.addEventListener('click', async () => {
    const note = prompt('Why is this being reopened?'); if (note === null) return;
    await api.post('/results/review', { resultIds: [b.dataset.reopen], decision: 'REOPENED', note }); toast('Reopened for correction.', 'success'); approvedTab(box);
  }));
}

async function expensesTab(box) {
  let rows = [];
  try { rows = await api.get('/approvals/expenses?status=PENDING'); } catch { box.innerHTML = '<div class="empty-state">You do not have access to financial approvals.</div>'; return; }
  box.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Ref</th><th>Category</th><th>Description</th><th>Amount</th><th>Date</th><th>Entered by</th><th></th></tr></thead><tbody>${rows.map((e) => `<tr><td>${escapeHtml(e.reference)}</td><td>${escapeHtml(e.category_name)}</td><td>${escapeHtml(e.description || '')}</td><td>${fmtCell('amount', e.amount)}</td><td>${fmtCell('expense_date', e.expense_date)}</td><td>${escapeHtml(e.recorded_by_name || '')}</td>
    <td style="white-space:nowrap;"><button class="btn btn-primary btn-sm" data-x="${e.id}" data-d="APPROVED">Approve</button> <button class="btn btn-outline btn-sm" data-x="${e.id}" data-d="REJECTED">Reject</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">No expenses are waiting for approval.</div>';
  box.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', async () => {
    let note = null; if (b.dataset.d === 'REJECTED') { note = prompt('Reason for rejecting?'); if (note === null) return; }
    await api.post(`/approvals/expenses/${b.dataset.x}`, { decision: b.dataset.d, note }); toast('Done.', 'success'); expensesTab(box);
  }));
}

(async () => {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'approvals' });
  root.innerHTML = '<div id="tabs"></div><div id="tabBody"><div class="spinner"></div></div>';
  tabBar(root.querySelector('#tabs'), [{ key: 'results', label: 'Results to approve' }, { key: 'approved', label: 'Published results' }, { key: 'expenses', label: 'Expenses' }], (k) => {
    const box = root.querySelector('#tabBody'); box.innerHTML = '<div class="spinner"></div>';
    ({ results: resultsTab, approved: approvedTab, expenses: expensesTab })[k](box);
  });
})();
