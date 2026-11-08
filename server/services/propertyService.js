/**
 * Properties (estates, houses, LANDS, commercial), their units, unit/property
 * categories and landlords/owners. Managers only ever see and touch the
 * properties assigned to them (propertyScope / canAccessProperty).
 */
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { nextId } = require('../utils/idGenerator');
const { writeAudit } = require('../utils/auditLogger');
const { buildUpdate, requireFields, numify } = require('../utils/sql');
const { propertyScope, canAccessProperty, ROLES } = require('../middleware/roles');

const PROPERTY_FIELDS = {
  name: 'name', kind: 'kind', purpose: 'purpose', constructionStatus: 'construction_status',
  completionPercent: 'completion_percent', expectedCompletionDate: 'expected_completion_date',
  categoryId: 'category_id', landlordId: 'landlord_id', managerId: 'manager_id', location: 'location',
  address: 'address', city: 'city', sizeSqm: 'size_sqm', askingPrice: 'asking_price',
  description: 'description', photoUrl: 'photo_url', listedPublicly: 'listed_publicly', status: 'status',
};

function assertAccess(user, propertyId) {
  if (!canAccessProperty(user, propertyId)) throw new AppError('You are not assigned to that property.', 403);
}

// ------------------------------------------------------------------ Properties
const PROPERTY_SELECT = `
  SELECT p.*, c.name AS category_name, l.name AS landlord_name, mu.name AS manager_name,
    (SELECT COUNT(*)::int FROM units x WHERE x.property_id = p.id) AS total_units,
    (SELECT COUNT(*)::int FROM units x WHERE x.property_id = p.id AND x.status = 'OCCUPIED') AS occupied_units,
    (SELECT COUNT(*)::int FROM units x WHERE x.property_id = p.id AND x.status = 'VACANT') AS vacant_units,
    (SELECT COALESCE(SUM(x.monthly_rent), 0) FROM units x WHERE x.property_id = p.id AND x.status = 'OCCUPIED') AS monthly_expected_rent,
    (SELECT COALESCE(SUM(x.monthly_rent), 0) FROM units x WHERE x.property_id = p.id) AS monthly_potential_rent
  FROM properties p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN landlords l ON l.id = p.landlord_id
  LEFT JOIN users mu ON mu.id = p.manager_id`;

async function listProperties(user, { kind, purpose, constructionStatus, status, q, listed } = {}) {
  const params = [];
  let sql = `${PROPERTY_SELECT} WHERE 1=1`;
  if (kind) { params.push(kind); sql += ` AND p.kind = $${params.length}`; }
  if (purpose) { params.push(purpose); sql += ` AND p.purpose = $${params.length}`; }
  if (constructionStatus) { params.push(constructionStatus); sql += ` AND p.construction_status = $${params.length}`; }
  if (status) { params.push(status); sql += ` AND p.status = $${params.length}`; }
  if (listed === 'true') sql += ' AND p.listed_publicly = true';
  if (q) { params.push(`%${q}%`); sql += ` AND (p.name ILIKE $${params.length} OR p.property_code ILIKE $${params.length} OR p.location ILIKE $${params.length} OR p.address ILIKE $${params.length})`; }
  sql += propertyScope(user, 'p.id', params);
  sql += ' ORDER BY p.created_at DESC LIMIT 1000';
  const { rows } = await query(sql, params);
  return rows.map((r) => numify(r, ['monthly_expected_rent', 'monthly_potential_rent', 'asking_price', 'size_sqm']));
}

async function getProperty(user, id) {
  assertAccess(user, id);
  const { rows } = await query(`${PROPERTY_SELECT} WHERE p.id = $1`, [id]);
  if (!rows.length) throw new AppError('Property not found.', 404);
  return numify(rows[0], ['monthly_expected_rent', 'monthly_potential_rent', 'asking_price', 'size_sqm']);
}

function validateProperty(b) {
  if (b.kind && !['ESTATE', 'HOUSE', 'LAND', 'COMMERCIAL', 'OTHER'].includes(b.kind)) throw new AppError('Invalid property kind.');
  if (b.purpose && !['RENT', 'SALE', 'RENT_OR_SALE', 'NOT_LISTED'].includes(b.purpose)) throw new AppError('Invalid purpose.');
  if (b.constructionStatus && !['COMPLETED', 'UNCOMPLETED'].includes(b.constructionStatus)) throw new AppError('Invalid construction status.');
  if (b.completionPercent !== undefined && b.completionPercent !== '' && (Number(b.completionPercent) < 0 || Number(b.completionPercent) > 100)) throw new AppError('Completion % must be between 0 and 100.');
}

async function createProperty(body, actor) {
  requireFields(body, ['name']);
  validateProperty(body);
  const completed = (body.constructionStatus || 'COMPLETED') === 'COMPLETED';
  return withTransaction(async (client) => {
    const code = await nextId('PRP');
    const { rows } = await client.query(
      `INSERT INTO properties (property_code, name, kind, purpose, construction_status, completion_percent, expected_completion_date,
         category_id, landlord_id, manager_id, location, address, city, size_sqm, asking_price, description, photo_url, listed_publicly, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [
        code, body.name.trim(), body.kind || 'ESTATE', body.purpose || 'RENT', body.constructionStatus || 'COMPLETED',
        completed ? 100 : Number(body.completionPercent) || 0, body.expectedCompletionDate || null,
        body.categoryId || null, body.landlordId || null, body.managerId || null, body.location || null, body.address || null,
        body.city || null, body.sizeSqm || null, body.askingPrice || null, body.description || null, body.photoUrl || null,
        !!body.listedPublicly, actor.uid,
      ]
    );
    // A Manager who lists a property can immediately work on it.
    if (actor.role === ROLES.MANAGER) {
      await client.query('INSERT INTO manager_properties (user_id, property_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [actor.uid, rows[0].id]);
    }
    await writeAudit({ user: actor, action: 'CREATE_PROPERTY', entity: 'properties', entityId: rows[0].id, after: rows[0] });
    return rows[0];
  });
}

async function updateProperty(id, body, actor) {
  assertAccess(actor, id);
  validateProperty(body);
  const patch = { ...body };
  if (patch.constructionStatus === 'COMPLETED') patch.completionPercent = 100;
  const { sets, params } = buildUpdate(patch, PROPERTY_FIELDS, 2);
  const before = await query('SELECT * FROM properties WHERE id = $1', [id]);
  if (!before.rows.length) throw new AppError('Property not found.', 404);
  const { rows } = await query(`UPDATE properties SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`, [id, ...params]);
  await writeAudit({ user: actor, action: 'UPDATE_PROPERTY', entity: 'properties', entityId: id, before: before.rows[0], after: rows[0] });
  return rows[0];
}

// ------------------------------------------------------------------ Categories
async function listCategories({ appliesTo, includeInactive } = {}) {
  const params = [];
  let sql = `SELECT c.*,
      (SELECT COUNT(*)::int FROM units u WHERE u.category_id = c.id) AS unit_count,
      (SELECT COUNT(*)::int FROM properties p WHERE p.category_id = c.id) AS property_count
    FROM categories c WHERE 1=1`;
  if (!includeInactive) sql += " AND c.status = 'ACTIVE'";
  if (appliesTo) { params.push(appliesTo); sql += ` AND c.applies_to = $${params.length}`; }
  sql += ' ORDER BY c.applies_to, c.display_order, c.name';
  const { rows } = await query(sql, params);
  return rows;
}

async function createCategory({ name, appliesTo, description, displayOrder }, actor) {
  if (!name || !name.trim()) throw new AppError('Category name is required.');
  const target = appliesTo || 'UNIT';
  if (!['UNIT', 'PROPERTY'].includes(target)) throw new AppError('appliesTo must be UNIT or PROPERTY.');
  const { rows } = await query(
    'INSERT INTO categories (name, applies_to, description, display_order) VALUES ($1,$2,$3,$4) RETURNING *',
    [name.trim(), target, description || null, Number(displayOrder) || 0]
  );
  await writeAudit({ user: actor, action: 'CREATE_CATEGORY', entity: 'categories', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

async function updateCategory(id, body, actor) {
  const { sets, params } = buildUpdate(body, { name: 'name', description: 'description', displayOrder: 'display_order', status: 'status' }, 2);
  const { rows } = await query(`UPDATE categories SET ${sets} WHERE id = $1 RETURNING *`, [id, ...params]);
  if (!rows.length) throw new AppError('Category not found.', 404);
  await writeAudit({ user: actor, action: 'UPDATE_CATEGORY', entity: 'categories', entityId: id, after: rows[0] });
  return rows[0];
}

// ------------------------------------------------------------------ Units
const UNIT_SELECT = `
  SELECT u.*, p.name AS property_name, p.property_code, c.name AS category_name,
    t.id AS tenant_id, t.tenant_code, (t.first_name || ' ' || t.last_name) AS tenant_name,
    CASE WHEN u.status = 'VACANT' AND u.vacant_since IS NOT NULL THEN (CURRENT_DATE - u.vacant_since) ELSE NULL END AS vacant_days
  FROM units u
  JOIN properties p ON p.id = u.property_id
  LEFT JOIN categories c ON c.id = u.category_id
  LEFT JOIN tenants t ON t.unit_id = u.id AND t.status IN ('ACTIVE', 'NOTICE')`;

async function listUnits(user, { propertyId, categoryId, status, houseNo, q } = {}) {
  const params = [];
  let sql = `${UNIT_SELECT} WHERE 1=1`;
  if (propertyId) { params.push(propertyId); sql += ` AND u.property_id = $${params.length}`; }
  if (categoryId) { params.push(categoryId); sql += ` AND u.category_id = $${params.length}`; }
  if (status) { params.push(status); sql += ` AND u.status = $${params.length}`; }
  if (houseNo) { params.push(houseNo); sql += ` AND u.house_no = $${params.length}`; }
  if (q) { params.push(`%${q}%`); sql += ` AND (u.unit_no ILIKE $${params.length} OR u.house_no ILIKE $${params.length} OR p.name ILIKE $${params.length})`; }
  sql += propertyScope(user, 'u.property_id', params);
  sql += ' ORDER BY p.name, u.house_no, u.unit_no LIMIT 3000';
  const { rows } = await query(sql, params);
  return rows.map((r) => numify(r, ['monthly_rent', 'security_deposit', 'vacant_days']));
}

async function getUnit(user, id) {
  const { rows } = await query(`${UNIT_SELECT} WHERE u.id = $1`, [id]);
  if (!rows.length) throw new AppError('Unit not found.', 404);
  assertAccess(user, rows[0].property_id);
  return numify(rows[0], ['monthly_rent', 'security_deposit', 'vacant_days']);
}

async function createUnit(body, actor) {
  requireFields(body, ['propertyId', 'unitNo']);
  assertAccess(actor, body.propertyId);
  const { rows } = await query(
    `INSERT INTO units (property_id, house_no, unit_no, category_id, rooms, has_kitchen, has_toilet, has_bathroom, floor, monthly_rent, security_deposit, status, photo_url, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      body.propertyId, (body.houseNo || '01').trim(), body.unitNo.trim(), body.categoryId || null, Number(body.rooms) || 1,
      body.hasKitchen === true || body.hasKitchen === 'true', body.hasToilet === true || body.hasToilet === 'true',
      body.hasBathroom === true || body.hasBathroom === 'true', body.floor || null, Number(body.monthlyRent) || 0,
      Number(body.securityDeposit) || 0, ['VACANT', 'RESERVED', 'MAINTENANCE'].includes(body.status) ? body.status : 'VACANT',
      body.photoUrl || null, body.notes || null,
    ]
  );
  await writeAudit({ user: actor, action: 'CREATE_UNIT', entity: 'units', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

/** Adds many identical units at once, e.g. 12 x "1 Room" in House 03 — numbered A-01.. (spec §3: unlimited). */
async function bulkCreateUnits(body, actor) {
  requireFields(body, ['propertyId', 'count']);
  assertAccess(actor, body.propertyId);
  const count = Number(body.count);
  if (!Number.isInteger(count) || count < 1 || count > 200) throw new AppError('count must be a whole number between 1 and 200.');
  const prefix = body.prefix || '';
  const startAt = Number(body.startAt) || 1;
  const created = await withTransaction(async (client) => {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const unitNo = `${prefix}${String(startAt + i).padStart(2, '0')}`;
      const { rows } = await client.query(
        `INSERT INTO units (property_id, house_no, unit_no, category_id, rooms, has_kitchen, has_toilet, has_bathroom, floor, monthly_rent, security_deposit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [body.propertyId, (body.houseNo || '01').trim(), unitNo, body.categoryId || null, Number(body.rooms) || 1,
          body.hasKitchen === true || body.hasKitchen === 'true', body.hasToilet === true || body.hasToilet === 'true',
          body.hasBathroom === true || body.hasBathroom === 'true', body.floor || null, Number(body.monthlyRent) || 0, Number(body.securityDeposit) || 0]
      );
      out.push(rows[0].id);
    }
    return out;
  });
  await writeAudit({ user: actor, action: 'BULK_CREATE_UNITS', entity: 'units', after: { propertyId: body.propertyId, count } });
  return { created: created.length };
}

async function updateUnit(id, body, actor) {
  const unit = await getUnit(actor, id);
  const patch = { ...body };
  if (patch.status !== undefined) {
    if (unit.tenant_id && patch.status !== 'OCCUPIED') throw new AppError('This unit has a current tenant. Move the tenant out before changing its availability.');
    if (!unit.tenant_id && patch.status === 'OCCUPIED') throw new AppError('A unit becomes Occupied by registering a tenant to it.');
    if (!unit.tenant_id && patch.status === 'VACANT' && unit.status !== 'VACANT') patch.vacantSince = new Date().toISOString().slice(0, 10);
  }
  const map = {
    houseNo: 'house_no', unitNo: 'unit_no', categoryId: 'category_id', rooms: 'rooms', hasKitchen: 'has_kitchen', hasToilet: 'has_toilet',
    hasBathroom: 'has_bathroom', floor: 'floor', monthlyRent: 'monthly_rent', securityDeposit: 'security_deposit', status: 'status',
    vacantSince: 'vacant_since', photoUrl: 'photo_url', notes: 'notes',
  };
  const { sets, params } = buildUpdate(patch, map, 2);
  const { rows } = await query(`UPDATE units SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`, [id, ...params]);
  await writeAudit({ user: actor, action: 'UPDATE_UNIT', entity: 'units', entityId: id, before: unit, after: rows[0] });
  return rows[0];
}

// ------------------------------------------------------------------ Landlords
async function listLandlords() {
  const { rows } = await query(`
    SELECT l.*,
      (SELECT COUNT(*)::int FROM properties p WHERE p.landlord_id = l.id) AS property_count,
      (SELECT COUNT(*)::int FROM units u JOIN properties p ON p.id = u.property_id WHERE p.landlord_id = l.id) AS unit_count,
      (SELECT COUNT(*)::int FROM tenants t JOIN units u ON u.id = t.unit_id JOIN properties p ON p.id = u.property_id
         WHERE p.landlord_id = l.id AND t.status IN ('ACTIVE','NOTICE')) AS tenant_count,
      (SELECT COALESCE(SUM(pay.amount),0) FROM payments pay JOIN properties p ON p.id = pay.property_id
         WHERE p.landlord_id = l.id AND pay.status = 'SUCCESSFUL' AND pay.type = 'RENT') AS revenue,
      (SELECT COALESCE(SUM(e.amount),0) FROM expenses e JOIN properties p ON p.id = e.property_id WHERE p.landlord_id = l.id) AS expenses
    FROM landlords l ORDER BY l.name`);
  return rows.map((r) => ({ ...numify(r, ['revenue', 'expenses']), net_income: Number(r.revenue) - Number(r.expenses) }));
}

async function createLandlord(body, actor) {
  requireFields(body, ['name']);
  const code = await nextId('LLD');
  const { rows } = await query(
    'INSERT INTO landlords (landlord_code, name, phone, email, id_number, address, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [code, body.name.trim(), body.phone || null, body.email || null, body.idNumber || null, body.address || null, body.notes || null]
  );
  await writeAudit({ user: actor, action: 'CREATE_LANDLORD', entity: 'landlords', entityId: rows[0].id, after: rows[0] });
  return rows[0];
}

async function updateLandlord(id, body, actor) {
  const { sets, params } = buildUpdate(body, { name: 'name', phone: 'phone', email: 'email', idNumber: 'id_number', address: 'address', notes: 'notes', status: 'status' }, 2);
  const { rows } = await query(`UPDATE landlords SET ${sets} WHERE id = $1 RETURNING *`, [id, ...params]);
  if (!rows.length) throw new AppError('Landlord not found.', 404);
  await writeAudit({ user: actor, action: 'UPDATE_LANDLORD', entity: 'landlords', entityId: id, after: rows[0] });
  return rows[0];
}

module.exports = {
  listProperties, getProperty, createProperty, updateProperty,
  listCategories, createCategory, updateCategory,
  listUnits, getUnit, createUnit, bulkCreateUnits, updateUnit,
  listLandlords, createLandlord, updateLandlord, assertAccess,
};
