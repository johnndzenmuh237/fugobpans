const { query } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { writeAudit } = require('../utils/auditLogger');

/**
 * PUBLIC — anyone can submit a review. NEVER auto-published (status
 * starts PENDING) — a Manager must explicitly approve it before it can
 * ever appear on the public site. This is the core trust rule of the
 * whole feature: no review is real until a human at the school saw it.
 */
async function submitReview({ name, email, rating, comment, photoUrl, honeypot }, ip) {
  // Honeypot spam trap: a hidden form field real users never fill in.
  // If it has a value, silently pretend success without writing anything.
  if (honeypot) {
    return { id: null, trapped: true };
  }

  if (!name || !comment) throw new AppError('Name and a review comment are required.');
  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    throw new AppError('Rating must be a whole number from 1 to 5.');
  }
  if (comment.length > 1000) throw new AppError('Review is too long (max 1000 characters).');

  const { rows } = await query(
    `INSERT INTO reviews (name, email, rating, comment, photo_url, submitted_ip)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, status`,
    [name.slice(0, 120), email || null, ratingNum, comment, photoUrl || null, ip || null]
  );
  return { id: rows[0].id, trapped: false };
}

/** PUBLIC — only ever returns APPROVED reviews. Never exposes email or submitted_ip. */
async function listPublicReviews() {
  const { rows } = await query(
    `SELECT id, name, rating, comment, photo_url, featured, created_at
     FROM reviews WHERE status = 'APPROVED' ORDER BY featured DESC, created_at DESC LIMIT 100`
  );
  const summaryRes = await query(
    `SELECT COUNT(*)::int AS total, COALESCE(AVG(rating), 0)::numeric(3,2) AS average
     FROM reviews WHERE status = 'APPROVED'`
  );
  return { reviews: rows, total: summaryRes.rows[0].total, average: Number(summaryRes.rows[0].average) };
}

/** MANAGER — sees every review regardless of status, including the fields hidden from the public. */
async function listAllReviews(status) {
  let sql = 'SELECT * FROM reviews WHERE 1=1';
  const params = [];
  if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
  sql += ' ORDER BY created_at DESC';
  const { rows } = await query(sql, params);
  return rows;
}

async function moderateReview(id, { status, featured }, actor) {
  const allowed = ['PENDING', 'APPROVED', 'REJECTED'];
  const updates = [];
  const params = [];
  if (status !== undefined) {
    if (!allowed.includes(status)) throw new AppError('Invalid status.');
    params.push(status); updates.push(`status = $${params.length}`);
    params.push(actor.uid); updates.push(`moderated_by = $${params.length}`);
    updates.push('moderated_at = now()');
  }
  if (featured !== undefined) { params.push(!!featured); updates.push(`featured = $${params.length}`); }
  if (!updates.length) throw new AppError('Nothing to update.');

  params.push(id);
  const { rows } = await query(`UPDATE reviews SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!rows.length) throw new AppError('Review not found.', 404);

  await writeAudit({ user: actor, action: 'MODERATE_REVIEW', entity: 'reviews', entityId: id, after: { status, featured } });
  return rows[0];
}

async function editReview(id, { comment, name }, actor) {
  const updates = [];
  const params = [];
  if (comment !== undefined) { params.push(comment.slice(0, 1000)); updates.push(`comment = $${params.length}`); }
  if (name !== undefined) { params.push(name.slice(0, 120)); updates.push(`name = $${params.length}`); }
  if (!updates.length) throw new AppError('Nothing to update.');
  params.push(id);
  const { rows } = await query(`UPDATE reviews SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!rows.length) throw new AppError('Review not found.', 404);
  await writeAudit({ user: actor, action: 'EDIT_REVIEW', entity: 'reviews', entityId: id, after: { comment, name } });
  return rows[0];
}

async function deleteReview(id, actor) {
  const { rowCount } = await query('DELETE FROM reviews WHERE id = $1', [id]);
  if (!rowCount) throw new AppError('Review not found.', 404);
  await writeAudit({ user: actor, action: 'DELETE_REVIEW', entity: 'reviews', entityId: id });
}

module.exports = { submitReview, listPublicReviews, listAllReviews, moderateReview, editReview, deleteReview };
