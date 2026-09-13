import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { escapeHtml, toast, qs } from './utils.js';

let myClasses = [];

async function loadSubjectsForClass(classId) {
  const subjects = await api.get(`/results/my-subjects?classId=${classId}`);
  qs('#subjectSelect').innerHTML = '<option value="">Select subject…</option>' + subjects.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

async function loadSheet() {
  const classId = qs('#classSelect').value;
  const subjectId = qs('#subjectSelect').value;
  const term = qs('#termInput').value;
  const sessionId = qs('#sessionSelect').value;
  if (!classId || !subjectId || !term || !sessionId) { qs('#sheetMount').innerHTML = ''; return; }

  const sheet = await api.get(`/results/sheet?classId=${classId}&subjectId=${subjectId}&term=${encodeURIComponent(term)}&academicSessionId=${sessionId}`);

  qs('#sheetMount').innerHTML = sheet.length ? `
    <p class="text-muted">${sheet.length} student(s) in this class — list generated automatically, nothing typed by hand.</p>
    <div class="table-wrap"><table><thead><tr><th>Student</th><th>ID</th><th>Score (out of 20)</th><th>Remarks</th></tr></thead><tbody>
      ${sheet.map((s) => `
        <tr>
          <td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</td>
          <td class="mono">${s.student_code}</td>
          <td><input type="number" min="0" max="20" step="0.5" data-student="${s.student_id}" data-score value="${s.score ?? ''}" style="max-width:100px;" /></td>
          <td><input type="text" data-student="${s.student_id}" data-remarks value="${escapeHtml(s.remarks || '')}" /></td>
        </tr>`).join('')}
    </tbody></table></div>
    <button id="saveAllBtn" class="btn btn-primary" style="margin-top:14px;">Save All Results</button>`
    : '<div class="empty-state">No active students in this class yet.</div>';

  qs('#saveAllBtn')?.addEventListener('click', async () => {
    const scoreInputs = Array.from(document.querySelectorAll('[data-score]'));
    let saved = 0;
    for (const input of scoreInputs) {
      if (input.value === '') continue;
      const studentId = input.dataset.student;
      const remarks = document.querySelector(`[data-remarks][data-student="${studentId}"]`).value;
      try {
        await api.post('/results', { studentId, classId, subjectId, academicSessionId: sessionId, term, score: Number(input.value), remarks });
        saved += 1;
      } catch { /* toast already shown */ }
    }
    toast(`Saved ${saved} result(s).`, 'success');
  });
}

async function main() {
  await initPortalLayout({ portal: 'TEACHER', activeKey: 'results' });
  const [classes, sessions] = await Promise.all([api.get('/results/my-classes'), api.get('/academics/sessions')]);
  myClasses = classes;

  if (!classes.length) {
    qs('#pageRoot').innerHTML = '<div class="empty-state">You have not been assigned to any class or subject yet. Contact the Manager.</div>';
    return;
  }

  qs('#pageRoot').innerHTML = `
    <div class="filters-bar">
      <select id="classSelect"><option value="">Select class…</option>${classes.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.student_count} students)</option>`).join('')}</select>
      <select id="subjectSelect"><option value="">Select class first…</option></select>
      <input type="text" id="termInput" placeholder="e.g. Sequence 1" style="max-width:160px;" />
      <select id="sessionSelect">${sessions.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select>
    </div>
    <div id="sheetMount"></div>`;

  qs('#classSelect').addEventListener('change', async (e) => { await loadSubjectsForClass(e.target.value); loadSheet(); });
  ['subjectSelect', 'termInput', 'sessionSelect'].forEach((id) => qs(`#${id}`).addEventListener('change', loadSheet));
  qs('#termInput').addEventListener('blur', loadSheet);
}
main();
