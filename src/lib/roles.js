export const ROLES = {
  developer: { label: "Developer", color: "text-cyan", bg: "bg-cyan/10", border: "border-cyan/30", power: 200 },
  ceo: { label: "CEO", color: "text-red-300", bg: "bg-red-500/20", border: "border-red-500/40", power: 500 },
  super_admin: { label: "Super Admin", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", power: 400 },
  admin: { label: "Admin", color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20", power: 300 },
  moderator: { label: "Moderator", color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20", power: 200 },
  user: { label: "User", color: "text-vapor", bg: "bg-secondary", border: "border-white/5", power: 100 },
};

export const normalizeRole = (role) => {
  if (Array.isArray(role)) {
    return role
      .map((entry) => normalizeRole(entry))
      .sort((a, b) => ROLES[b].power - ROLES[a].power)[0] || "user";
  }
  const normalized = String(role || "user").trim().toLowerCase();
  if (normalized === "superadmin") return "super_admin";
  return ROLES[normalized] ? normalized : "user";
};

export const getRoleConfig = (role) => ROLES[normalizeRole(role)];

// Public titles never reveal which Admin holds the private CEO permissions.
// Permission checks continue to use normalizeRole/getRoleConfig above.
export const publicRole = role => normalizeRole(role) === "ceo" ? "admin" : normalizeRole(role);
export const getPublicRoleConfig = role => ROLES[publicRole(role)];
export const publicRoleBadges = badges => (Array.isArray(badges) ? badges : []).map(badge => (
  badge?.type === "ceo" ? { ...badge, type: "admin", name: "Admin" } : badge
)).filter((badge, index, all) => badge?.type !== "admin" || all.findIndex(item => item?.type === "admin") === index);

export function publicStaffPresentation(value) {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(publicStaffPresentation);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (["role", "admin_role", "sender_role", "sender_admin_role", "user_role"].includes(key) && item === "ceo") return [key, "admin"];
    if (key === "badges") return [key, publicRoleBadges(item)];
    return [key, publicStaffPresentation(item)];
  }));
}

export const hasRolePower = (role, minimumRole) => {
  return getRoleConfig(role).power >= getRoleConfig(minimumRole).power;
};

export const effectiveRoleForUser = (user) => (
  [user?.role, user?.admin_role, user?.is_admin ? "admin" : null]
    .filter(Boolean)
    .reduce((best, role) => (
      getRoleConfig(role).power > getRoleConfig(best).power ? normalizeRole(role) : best
    ), "user")
);

export const isStaffUser = (user) => hasRolePower(effectiveRoleForUser(user), "moderator");

export const canAccessAdminPanel = (role) => hasRolePower(role, "moderator");

export const canManageWallets = (role) => hasRolePower(role, "admin");

export const canViewUserIps = (role) => hasRolePower(role, "admin");

export const canManageRoles = (role) => normalizeRole(role) === "ceo";
