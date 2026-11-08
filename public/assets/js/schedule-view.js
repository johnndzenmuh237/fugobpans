import { escapeHtml, WEEKDAYS } from './ui.js';
/** Weekly timetable grouped by day. Works for teacher, student, parent and admin views. */
export function renderSchedule(slots, { showClass = false, showTeacher = true } = {}) {
  if (!slots.length) return '<div class="empty-state">No lessons scheduled yet.</div>';
  const byDay = {}; slots.forEach((s) => { (byDay[s.weekday] ||= []).push(s); });
  return Object.keys(byDay).sort().map((d) => `<div class="card card-pad" style="margin-bottom:10px;"><strong>${WEEKDAYS[d]}</strong>
    ${byDay[d].map((s) => `<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--slate-100);font-size:.88rem;"><span style="width:110px;font-variant-numeric:tabular-nums;">${(s.start_time || '').slice(0, 5)}–${(s.end_time || '').slice(0, 5)}</span>
      <span style="flex:1;"><strong>${escapeHtml(s.subject_name)}</strong>${showClass ? ` · ${escapeHtml(s.class_name)}` : ''}${showTeacher && s.teacher_name ? ` · ${escapeHtml(s.teacher_name)}` : ''}</span>${s.room ? `<span class="text-muted">Room ${escapeHtml(s.room)}</span>` : ''}</div>`).join('')}</div>`).join('');
}
