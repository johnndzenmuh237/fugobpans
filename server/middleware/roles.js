const ROLES = { MANAGER: 'MANAGER', ACCOUNTANT: 'ACCOUNTANT', TEACHER: 'TEACHER', EMPLOYEE: 'EMPLOYEE', STUDENT: 'STUDENT' };

const FINANCE_ROLES = [ROLES.MANAGER, ROLES.ACCOUNTANT];
const STAFF_ROLES = [ROLES.MANAGER, ROLES.ACCOUNTANT, ROLES.TEACHER, ROLES.EMPLOYEE];

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { ROLES, FINANCE_ROLES, STAFF_ROLES, allowRoles };
