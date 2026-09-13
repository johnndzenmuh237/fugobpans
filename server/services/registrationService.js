const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/error-handler');
const { nextId } = require('../utils/idGenerator');
const { notify } = require('./notificationService');
const { createInvoiceForStudent } = require('./invoiceService');

/**
 * PUBLIC — a visitor registers a student for a specific class. No login,
 * no account, no document upload (spec §2, §3). This single transaction
 * creates the registration record, immediately converts it into a real
 * student record, and generates the invoice — all three happen together
 * so nothing is ever "half registered" (spec §11, §21).
 */
async function submitRegistration(body) {
  const required = ['classId', 'firstName', 'lastName', 'dateOfBirth', 'gender', 'guardianName', 'guardianPhone'];
  for (const f of required) if (!body[f]) throw new AppError(`Missing required field: ${f}`);

  return withTransaction(async (client) => {
    const classRes = await client.query('SELECT * FROM classes WHERE id = $1 AND status = $2', [body.classId, 'ACTIVE']);
    if (!classRes.rows.length) throw new AppError('Selected class is not available.');
    const cls = classRes.rows[0];

    const sessionRes = await client.query('SELECT * FROM academic_sessions WHERE status = $1 ORDER BY start_date DESC LIMIT 1', ['ACTIVE']);
    if (!sessionRes.rows.length) throw new AppError('No active academic session is configured.');
    const session = sessionRes.rows[0];

    const feeRes = await client.query('SELECT * FROM fee_structures WHERE class_id = $1 AND academic_session_id = $2', [body.classId, session.id]);
    if (!feeRes.rows.length) throw new AppError('Fees have not been configured for this class yet. Please contact the school office.');

    const registrationNumber = await nextId('REG');
    const regRes = await client.query(
      `INSERT INTO registrations (
         registration_number, class_id, academic_session_id, first_name, middle_name, last_name,
         date_of_birth, gender, nationality, birthplace, previous_school, previous_class,
         guardian_name, guardian_relationship, guardian_phone, guardian_whatsapp, guardian_email,
         guardian_address, emergency_contact, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'CONFIRMED')
       RETURNING *`,
      [
        registrationNumber, body.classId, session.id, body.firstName, body.middleName || null, body.lastName,
        body.dateOfBirth, body.gender, body.nationality || null, body.birthplace || null, body.previousSchool || null, body.previousClass || null,
        body.guardianName, body.guardianRelationship || null, body.guardianPhone, body.guardianWhatsapp || null, body.guardianEmail || null,
        body.guardianAddress || null, body.emergencyContact || null,
      ]
    );
    const registration = regRes.rows[0];

    // Immediately create the student record — no manual re-entry (spec §21).
    const studentCode = await nextId('STU');
    const studRes = await client.query(
      `INSERT INTO students (
         student_code, registration_id, class_id, academic_session_id, first_name, middle_name, last_name,
         date_of_birth, gender, guardian_name, guardian_relationship, guardian_phone, guardian_whatsapp,
         guardian_email, guardian_address, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'ACTIVE')
       RETURNING *`,
      [
        studentCode, registration.id, body.classId, session.id, body.firstName, body.middleName || null, body.lastName,
        body.dateOfBirth, body.gender, body.guardianName, body.guardianRelationship || null, body.guardianPhone,
        body.guardianWhatsapp || null, body.guardianEmail || null, body.guardianAddress || null,
      ]
    );
    const student = studRes.rows[0];

    await client.query('UPDATE registrations SET student_id = $1 WHERE id = $2', [student.id, registration.id]);

    const invoice = await createInvoiceForStudent(client, { studentId: student.id, feeStructureId: feeRes.rows[0].id });

    await notify({
      toRole: 'MANAGER',
      title: 'New student registration',
      message: `${body.firstName} ${body.lastName} registered for ${cls.name}. Registration ${registrationNumber}, Invoice ${invoice.invoice_number} (${Number(invoice.total_amount).toLocaleString()} FCFA).`,
      type: 'INFO',
      link: `/admin/student-profile.html?id=${student.id}`,
    });

    return { registration, student, invoice, className: cls.name };
  });
}

async function listRegistrations(filters = {}) {
  let sql = `SELECT r.*, c.name AS class_name FROM registrations r JOIN classes c ON c.id = r.class_id WHERE 1=1`;
  const params = [];
  if (filters.classId) { params.push(filters.classId); sql += ` AND r.class_id = $${params.length}`; }
  sql += ' ORDER BY r.created_at DESC LIMIT 1000';
  const { rows } = await query(sql, params);
  return rows;
}

module.exports = { submitRegistration, listRegistrations };
