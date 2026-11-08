/** Public website: property listings (lands, houses, completed / uncompleted) and enquiries (leads). */
const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');
const { numify, requireFields } = require('../utils/sql');
const { notifyStaff } = require('./notificationService');
const { propertyScope } = require('../middleware/roles');

// Deliberately excludes landlord, manager, tenant and financial data.
const PUBLIC_COLUMNS = `p.id, p.property_code, p.name, p.kind, p.purpose, p.construction_status, p.completion_percent, p.expected_completion_date,
  p.location, p.city, p.size_sqm, p.asking_price, p.description, p.photo_url, c.name AS category_name,
  (SELECT COUNT(*)::int FROM units u WHERE u.property_id = p.id AND u.status = 'VACANT') AS vacant_units,
  (SELECT MIN(u.monthly_rent) FROM units u WHERE u.property_id = p.id AND u.status = 'VACANT') AS rent_from`;

async function listListings({ kind, purpose, constructionStatus, city, q, maxPrice } = {}) {
  const params = [];
  let sql = `SELECT ${PUBLIC_COLUMNS} FROM properties p LEFT JOIN categories c ON c.id = p.category_id WHERE p.listed_publicly = true AND p.status = 'ACTIVE'`;
  if (kind) { params.push(kind); sql += ` AND p.kind = $${params.length}`; }
  if (purpose) { params.push(purpose); sql += ` AND p.purpose IN ($${params.length}, 'RENT_OR_SALE')`; }
  if (constructionStatus) { params.push(constructionStatus); sql += ` AND p.construction_status = $${params.length}`; }
  if (city) { params.push(`%${city}%`); sql += ` AND (p.city ILIKE $${params.length} OR p.location ILIKE $${params.length})`; }
  if (q) { params.push(`%${q}%`); sql += ` AND (p.name ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.location ILIKE $${params.length})`; }
  if (maxPrice) { params.push(Number(maxPrice)); sql += ` AND p.asking_price <= $${params.length}`; }
  sql += ' ORDER BY p.created_at DESC LIMIT 200';
  const { rows } = await query(sql, params);
  return rows.map((r) => numify(r, ['asking_price', 'size_sqm', 'rent_from']));
}

async function getListing(id) {
  const { rows } = await query(`SELECT ${PUBLIC_COLUMNS} FROM properties p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1 AND p.listed_publicly = true AND p.status = 'ACTIVE'`, [id]);
  if (!rows.length) throw new AppError('Listing not found.', 404);
  const { rows: units } = await query(`
    SELECT u.id, u.house_no, u.unit_no, u.rooms, u.has_kitchen, u.has_toilet, u.has_bathroom, u.monthly_rent, u.security_deposit, c.name AS category_name
    FROM units u LEFT JOIN categories c ON c.id = u.category_id WHERE u.property_id = $1 AND u.status = 'VACANT' ORDER BY u.house_no, u.unit_no LIMIT 100`, [id]);
  return { ...numify(rows[0], ['asking_price', 'size_sqm', 'rent_from']), vacantUnits: units.map((u) => numify(u, ['monthly_rent', 'security_deposit'])) };
}

async function listPublicCategories() {
  const { rows } = await query("SELECT id, name, applies_to FROM categories WHERE status = 'ACTIVE' ORDER BY applies_to, display_order, name");
  return rows;
}

async function submitInquiry({ propertyId, name, phone, email, interest, message, website }, ip) {
  if (website) return { ok: true }; // honeypot: bots fill hidden fields; reply the same, save nothing
  requireFields({ name, phone }, ['name', 'phone']);
  if (!['RENT', 'BUY', 'VISIT', 'GENERAL'].includes(interest || 'GENERAL')) throw new AppError('Invalid enquiry type.');
  if (String(phone).replace(/\D/g, '').length < 8) throw new AppError('Please enter a valid phone number.');
  await query(
    'INSERT INTO inquiries (property_id, name, phone, email, interest, message, submitted_ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [propertyId || null, name.trim().slice(0, 120), String(phone).trim(), email || null, interest || 'GENERAL', (message || '').slice(0, 1000) || null, ip || null]
  );
  await notifyStaff({ title: 'New property enquiry', message: `${name.trim()} (${phone}) sent an enquiry.`, type: 'INFO', link: '/admin/inquiries.html' });
  return { ok: true };
}

async function listInquiries(user, { status } = {}) {
  const params = [];
  let sql = 'SELECT i.*, p.name AS property_name FROM inquiries i LEFT JOIN properties p ON p.id = i.property_id WHERE 1=1';
  if (status) { params.push(status); sql += ` AND i.status = $${params.length}`; }
  sql += propertyScope(user, 'i.property_id', params);
  sql += ' ORDER BY i.created_at DESC LIMIT 500';
  const { rows } = await query(sql, params);
  return rows;
}

async function updateInquiry(id, { status, staffNote }, actor) {
  if (status && !['NEW', 'CONTACTED', 'CLOSED'].includes(status)) throw new AppError('Invalid status.');
  const { rows } = await query('UPDATE inquiries SET status = COALESCE($1, status), staff_note = COALESCE($2, staff_note) WHERE id = $3 RETURNING *', [status || null, staffNote ?? null, id]);
  if (!rows.length) throw new AppError('Enquiry not found.', 404);
  await writeAudit({ user: actor, action: 'UPDATE_INQUIRY', entity: 'inquiries', entityId: id, after: { status } });
  return rows[0];
}

module.exports = { listListings, getListing, listPublicCategories, submitInquiry, listInquiries, updateInquiry };
