export const ROLES = {
  ceo: { label: "CEO", color: "text-red-300", bg: "bg-red-500/20", border: "border-red-500/40", power: 500 },
  super_admin: { label: "Super Admin", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", power: 400 },
  admin: { label: "Admin", color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20", power: 300 },
  moderator: { label: "Moderator", color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20", power: 200 },
  user: { label: "User", color: "text-vapor", bg: "bg-secondary", border: "border-white/5", power: 100 },
};

export const normalizeRole = (role) => {
  if (role === "superadmin") return "super_admin";
  return ROLES[role] ? role : "user";
};

export const getRoleConfig = (role) => ROLES[normalizeRole(role)];

export const hasRolePower = (role, minimumRole) => {
  return getRoleConfig(role).power >= getRoleConfig(minimumRole).power;
};

export const canAccessAdminPanel = (role) => hasRolePower(role, "moderator");

export const canManageWallets = (role) => hasRolePower(role, "admin");

export const canManageRoles = (role) => hasRolePower(role, "super_admin");
