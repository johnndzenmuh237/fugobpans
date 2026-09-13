import { initPortalLayout } from './layout.js';
import { api } from './api.js';
import { renderTable, openFormModal } from './crud-table.js';
import { escapeHtml, toast, qs } from './utils.js';

async function load() {
  const [classes, categories, employees, subjects] = await Promise.all([api.get('/academics/classes'), api.get('/academics/categories'), api.get('/employees'), api.get('/academics/subjects').catch(() => [])]);
  const empById = Object.fromEntries(employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`]));
  renderTable(qs('#tableMount'), classes, [
    { key: 'name', label: 'Class' },
    { key: 'category_name', label: 'Category' },
    { key: 'student_count', label: 'Students' },
    { key: 'class_teacher_id', label: 'Class Teacher', render: (r) => escapeHtml(empById[r.class_teacher_id] || 'Unassigned') },
    { key: 'actions', label: '', render: (r) => `<button class="btn btn-sm btn-outline" data-assign="${r.id}">Assign Class Teacher</button> <button class="btn btn-sm btn-outline" data-subject="${r.id}">Assign Subject Teacher</button>` },
  ]);
  qs('#tableMount').querySelectorAll('[data-assign]').forEach((btn) => btn.addEventListener('click', () => {
    openFormModal({
      title: 'Assign Class Teacher',
      fields: [{ name: 'employeeId', label: 'Teacher', type: 'select', required: true, options: employees.map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` })) }],
      onSubmit: async (v) => { await api.patch(`/academics/classes/${btn.dataset.assign}/teacher`, v); toast('Teacher assigned.', 'success'); load(); },
    });
  }));
  qs('#tableMount').querySelectorAll('[data-subject]').forEach((btn) => btn.addEventListener('click', () => {
    openFormModal({
      title: 'Assign a Subject Teacher (enables results entry — new feature)',
      fields: [
        { name: 'subjectId', label: 'Subject', type: 'select', required: true, options: subjects.map((s) => ({ value: s.id, label: s.name })) },
        { name: 'teacherId', label: 'Teacher', type: 'select', required: true, options: employees.map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` })) },
      ],
      onSubmit: async (v) => { await api.post(`/academics/classes/${btn.dataset.subject}/subjects`, v); toast('Subject teacher assigned.', 'success'); },
    });
  }));
}

async function main() {
  await initPortalLayout({ portal: 'MANAGER', activeKey: 'categories-classes' });
  qs('#pageActions').innerHTML = `<button id="addCatBtn" class="btn btn-outline">Add Category</button> <button id="addSubjectBtn" class="btn btn-outline">Add Subject</button> <button id="addClassBtn" class="btn btn-primary">Add Class</button>`;
  qs('#pageRoot').innerHTML = '<div id="tableMount"></div>';
  await load();

  qs('#addSubjectBtn').addEventListener('click', () => openFormModal({
    title: 'Add Subject', fields: [{ name: 'name', label: 'Subject name (e.g. Mathematics)', required: true }],
    onSubmit: async (v) => { await api.post('/academics/subjects', v); toast('Subject created.', 'success'); },
  }));

  qs('#addCatBtn').addEventListener('click', () => openFormModal({
    title: 'Add Category', fields: [{ name: 'name', label: 'Category name (e.g. Pre-Nursery)', required: true }],
    onSubmit: async (v) => { await api.post('/academics/categories', v); toast('Category created.', 'success'); load(); },
  }));

  qs('#addClassBtn').addEventListener('click', async () => {
    const categories = await api.get('/academics/categories');
    openFormModal({
      title: 'Add Class',
      fields: [
        { name: 'name', label: 'Class name (e.g. Nursery 1)', required: true },
        { name: 'categoryId', label: 'Category', type: 'select', required: true, options: categories.map((c) => ({ value: c.id, label: c.name })) },
        { name: 'capacity', label: 'Capacity', type: 'number' },
      ],
      onSubmit: async (v) => { await api.post('/academics/classes', { ...v, capacity: Number(v.capacity) || null }); toast('Class created.', 'success'); load(); },
    });
  });
}
main();
