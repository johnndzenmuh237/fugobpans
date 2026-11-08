/** Maintenance requests (spec §14): tenants report, managers assign, costs flow into expenses. */
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { nextId } = require('../utils/idGenerator');
const { writeAudit } = require('../utils/auditLogger');
const { propertyScope, canAccessProperty } = require('../middleware/roles');
const { numify, requireFields } = require('../utils/sql');
const { notify, notifyStaff } = require('./notificationService');

const STATUSES = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

const SELECT = `
  SELECT m.*, p.name AS property_name, u.unit_no, u.house_no, w.name AS worker_name, w.trade AS worker_trade, w.phone AS worker_phone,
    (t.first_name || ' ' || t.last_name) AS tenant_name, t.phone AS tenant_phone,
    (CURRENT_DATE - m.reported_at::date) AS age_days
  FROM maintenance_requests m
  JOIN properties p ON p.id = m.property_id
  LEFT JOIN units u ON u.id = m.unit_id
  LEFT JOIN maintenance_workers w ON w.id = m.worker_id
  LEFT JOIN tenants t ON t.id = m.tenant_id`;

async function listRequests(user, { status, propertyId, tenantId, priority, q } = {}) {
  const params = [];
  let sql = `${SELECT} WHERE 1=1`;
  if (status === 'OPEN') sql += " AND m.status IN ('PENDING','ASSIGNED','IN_PROGRESS')";
  else if (status) { params.push(status); sql += ` AND m.status = $${params.length}`; }
  if (propertyId) { params.push(propertyId); sql += ` AND m.property_id = $${params.length}`; }
  if (tenantId) { params.push(tenantId); sql += ` AND m.tenant_id = $${params.length}`; }
  if (priority) { params.push(priority); sql += ` AND m.priority = $${params.length}`; }
  if (q) { params.push(`%${q}%`); sql += ` AND (m.title ILIKE $${params.length} OR m.request_no ILIKE $${params.length} OR p.name ILIKE $${params.length})`; }
  if (user) sql += propertyScope(user, 'm.property_id', params);
  sql += " ORDER BY CASE m.status WHEN 'PENDING' THEN 0 WHEN 'ASSIGNED' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END, m.reported_at DESC LIMIT 1000";
  const { rows } = await query(sql, params);
  return rows.map((r) => numify(r, ['estimated_cost', 'actual_cost', 'age_days']));
}

/** Staff-created OR tenant-created (tenantId set, createdBy null). */
async function createRequest({ unitId, propertyId, tenantId = null, title, description, priority = 'NORMAL', photoUrl }, actor = null) {
  requireFields({ title }, ['title']);
  if (!PRIORITIES.includes(priority)) throw new AppError('Invalid priority.');
  let propId = propertyId;
  let uId = unitId || null;
  if (uId) {
    const { rows } = await query('SELECT property_id FROM units WHERE id = $1', [uId]);
    if (!rows.length) throw new AppError('Unit not found.', 404);
    propId = rows[0].property_id;
  }
  if (!propId) throw new AppError('Choose the property (or unit) the problem is in.');
  if (actor && !canAccessProperty(actor, propId)) throw new AppError('You are not assigned to that property.', 403);

  const requestNo = await nextId('MNT');
  const { rows } = await query(
    `INSERT INTO maintenance_requests (request_no, property_id, unit_id, tenant_id, title, description, priority, photo_url, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [requestNo, propId, uId, tenantId, title.trim(), description || null, priority, photoUrl || null, actor?.uid || null]
  );
  if (actor) await writeAudit({ user: actor, action: 'CREATE_MAINTENANCE', entity: 'maintenance_requests', entityId: rows[0].id, after: rows[0] });
  await notifyStaff({ title: 'New maintenance request', message: `${requestNo}: ${title.trim()}${priority === 'URGENT' ? ' (URGENT)' : ''}`, type: priority === 'URGENT' ? 'ERROR' : 'WARNING', link: '/admin/maintenance.html' });
  return rows[0];
}

async function updateRequest(id, body, actor) {
  const { rows: cur } = await query('SELECT * FROM maintenance_requests WHERE id = $1', [id]);
  const before = cur[0];
  if (!before) throw new AppError('Request not found.', 404);
  if (!canAccessProperty(actor, before.property_id)) throw new AppError('You are not assigned to that property.', 403);
  if (body.status && !STATUSES.includes(body.status)) throw new AppError('Invalid status.');
  if (body.priority && !PRIORITIES.includes(body.priority)) throw new AppError('Invalid priority.');

  let status = body.status || before.status;
  // Assigning a worker to a pending request moves it to ASSIGNED automatically.
  if (body.workerId && !body.status && before.status === 'PENDING') status = 'ASSIGNED';
  const completedAt = status === 'COMPLETED' && before.status !== 'COMPLETED' ? new Date() : (status === 'COMPLETED' ? before.completed_at : null);

  const merged = {
    workerId: body.workerId !== undefined ? (body.workerId || null) : before.worker_id,
    estimatedCost: body.estimatedCost !== undefined ? (body.estimatedCost === '' ? null : body.estimatedCost) : before.estimated_cost,
    actualCost: body.actualCost !== undefined ? (body.actualCost === '' ? null : body.actualCost) : before.actual_cost,
    materials: body.materials !== undefined ? body.materials || null : before.materials,
    notes: body.notes !== undefined ? body.notes || null : before.notes,
    priority: body.priority || before.priority,
  };

  const updated = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE maintenance_requests SET status = $1, worker_id = $2, estimated_cost = $3, actual_cost = $4, materials = $5, notes = $6,
         priority = $7, completed_at = $8, updated_at = now() WHERE id = $9 RETURNING *`,
      [status, merged.workerId, merged.estimatedCost, merged.actualCost, merged.materials, merged.notes, merged.priority, completedAt, id]
    );
    // Completed jobs with a real cost become a property expense automatically (once).
    if (status === 'COMPLETED' && Number(merged.actualCost) > 0) {
      const ex = await client.query('SELECT 1 FROM expenses WHERE maintenance_request_id = $1', [id]);
      if (!ex.rows.length) {
        let { rows: cat } = await client.query("SELECT id FROM expense_categories WHERE name = 'Maintenance' LIMIT 1");
        if (!cat.length) ({ rows: cat } = await client.query("INSERT INTO expense_categories (name) VALUES ('Maintenance') RETURNING id"));
        const reference = await nextId('EXP');
        await client.query(
          `INSERT INTO expenses (reference, property_id, category_id, description, amount, vendor, maintenance_request_id, recorded_by, auto_generated)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)`,
          [reference, before.property_id, cat[0].id, `Maintenance ${before.request_no}: ${before.title}`, merged.actualCost, null, id, actor.uid]
        );
      }
    }
    return rows[0];
  });
  await writeAudit({ user: actor, action: 'UPDATE_MAINTENANCE', entity: 'maintenance_requests', entityId: id, before, after: updated });
  if (before.tenant_id && status !== before.status) {
    await notify({ toTenantId: before.tenant_id, title: 'Maintenance update', type: status === 'COMPLETED' ? 'SUCCESS' : 'INFO',
      message: `${before.request_no} ("${before.title}") is now ${status.replace('_', ' ').toLowerCase()}.` });
  }
  return updated;
}

// ------------------------------------------------------------------ Workers
async function listWorkers() {
  const { rows } = await query("SELECT * FROM maintenance_workers WHERE status = 'ACTIVE' ORDER BY trade, name");
  return rows;
}
async function createWorker({ name, trade, phone }, actor) {
  requireFields({ name }, ['name']);
  const { rows } = await query('INSERT INTO maintenance_workers (name, trade, phone) VALUES ($1,$2,$3) RETURNING *', [name.trim(), trade || 'Technician', phone || null]);
  await writeAudit({ user: actor, action: 'CREATE_WORKER', entity: 'maintenance_workers', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

module.exports = { listRequests, createRequest, updateRequest, listWorkers, createWorker };
