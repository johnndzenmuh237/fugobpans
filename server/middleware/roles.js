const ROLES = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER', // original top role; kept so existing accounts and routes keep working
  PRINCIPAL: 'PRINCIPAL',
  VICE_PRINCIPAL: 'VICE_PRINCIPAL',
  ADMINISTRATOR: 'ADMINISTRATOR',
  ACADEMIC_ADMIN: 'ACADEMIC_ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  TEACHER: 'TEACHER',
  EMPLOYEE: 'EMPLOYEE',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
};

// Posts the Owner creates and controls. They run the school day to day.
const MANAGEMENT_ROLES = [ROLES.PRINCIPAL, ROLES.VICE_PRINCIPAL, ROLES.ADMINISTRATOR, ROLES.ACADEMIC_ADMIN];

const FINANCE_ROLES = [ROLES.MANAGER, ROLES.ACCOUNTANT];
const STAFF_ROLES = [ROLES.MANAGER, ROLES.ACCOUNTANT, ROLES.TEACHER, ROLES.EMPLOYEE];

/**
 * Every existing route is written as allowRoles(ROLES.MANAGER, ...). Rather than
 * rewriting ~50 routes, MANAGER is treated as "management level":
 *  - OWNER always passes (full access to every record).
 *  - PRINCIPAL / VICE_PRINCIPAL / ADMINISTRATOR / ACADEMIC_ADMIN pass wherever MANAGER passes.
 * Owner-only actions use allowOwner(), which nobody else can satisfy.
 */
function allowRoles(...roles) {
  return (req, res, next) => {
    const role = req.user && req.user.role;
    const ok = role === ROLES.OWNER
      || roles.includes(role)
      || (roles.includes(ROLES.MANAGER) && MANAGEMENT_ROLES.includes(role));
    if (!ok) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    next();
  };
}

/** True for OWNER, legacy MANAGER and every management post. */
function isManagementLevel(user) {
  return !!user && (user.role === ROLES.OWNER || user.role === ROLES.MANAGER || MANAGEMENT_ROLES.includes(user.role));
}

/**
 * Per-module permission set by the Owner when creating a management account
 * (students, teachers, academics, finance, announcements, reports, registrations).
 * OWNER and legacy MANAGER always pass. Principals/Vice/Admins pass only with the flag.
 * Non-management roles (teacher, accountant, ...) are untouched: allowRoles already gates them.
 */
function needs(permission) {
  return (req, res, next) => {
    const u = req.user;
    if (!u) return res.status(401).json({ error: 'Not logged in.' });
    if (u.role === ROLES.OWNER || u.role === ROLES.MANAGER || !MANAGEMENT_ROLES.includes(u.role)) return next();
    if (u.permissions && u.permissions[permission] === true) return next();
    return res.status(403).json({ error: `Your account has not been granted "${permission}" access. Ask the School Owner.` });
  };
}

/** Owner or legacy top-level Manager only — for settings that even a Principal should not change. */
function topLevelOnly(req, res, next) {
  if (!req.user || ![ROLES.OWNER, ROLES.MANAGER].includes(req.user.role)) return res.status(403).json({ error: 'Only the School Owner can change this.' });
  next();
}

function allowOwner(req, res, next) {
  if (!req.user || req.user.role !== ROLES.OWNER) {
    return res.status(403).json({ error: 'Only the School Owner can perform this action.' });
  }
  next();
}

module.exports = { ROLES, MANAGEMENT_ROLES, FINANCE_ROLES, STAFF_ROLES, allowRoles, allowOwner, topLevelOnly, needs, isManagementLevel };
