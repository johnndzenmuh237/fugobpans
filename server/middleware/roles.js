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


/**
 * Fine-grained permissions the Owner can grant one by one (stored in users.permissions alongside the older flags).
 *
 * Resolution order for a person who is not the Owner:
 *   1. An explicit true/false on the fine-grained key always wins (so the Owner can switch ANY single power off,
 *      even for the legacy top-level MANAGER role).
 *   2. If the key has never been set (every account created before this upgrade), behaviour is exactly what it was:
 *        - MANAGER                     -> allowed
 *        - principal/vice/admin posts  -> allowed iff they hold the older parent flag (finance, registrations, ...)
 *        - ACCOUNTANT                  -> allowed for the money-handling keys only
 *        - anyone else                 -> denied
 */
const FINE_PERMISSIONS = {
  register_students:      { label: 'Register students manually',       parents: ['registrations', 'students'], accountantDefault: false },
  approve_payments:       { label: 'Verify / reject payments',         parents: ['finance'],                    accountantDefault: true },
  issue_receipts:         { label: 'Record payments & issue receipts', parents: ['finance'],                    accountantDefault: true },
  modify_fees:            { label: 'Create or change fees & instalments', parents: ['finance'],                 accountantDefault: false },
  view_financial_reports: { label: 'View financial reports',           parents: ['finance', 'reports'],         accountantDefault: true },
  reconcile_payments:     { label: 'Reconcile with MTN / Orange statements', parents: [],                       accountantDefault: false, explicitOnly: true },
  manage_reminders:       { label: 'Manage fee reminders & messaging', parents: ['finance'],                    accountantDefault: false },
};

function hasPermission(user, key) {
  if (!user) return false;
  if (user.role === ROLES.OWNER) return true;
  const def = FINE_PERMISSIONS[key];
  if (!def) return false;
  const perms = user.permissions || {};
  if (perms[key] === true) return true;
  if (perms[key] === false) return false;
  if (def.explicitOnly) return false;
  if (user.role === ROLES.MANAGER) return true;
  if (MANAGEMENT_ROLES.includes(user.role)) return def.parents.some((p) => perms[p] === true);
  if (user.role === ROLES.ACCOUNTANT) return def.accountantDefault;
  return false;
}

/** Route guard. Place after requireAuth. The server enforces this on every request; hiding a menu item is only cosmetic. */
function requirePermission(...keys) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not logged in.' });
    if (keys.some((k) => hasPermission(req.user, k))) return next();
    const names = keys.map((k) => FINE_PERMISSIONS[k]?.label || k).join(' / ');
    return res.status(403).json({ error: `Your account has not been granted this permission (${names}). Ask the School Owner.` });
  };
}

module.exports = { FINE_PERMISSIONS, hasPermission, requirePermission, ROLES, MANAGEMENT_ROLES, FINANCE_ROLES, STAFF_ROLES, allowRoles, allowOwner, topLevelOnly, needs, isManagementLevel };
