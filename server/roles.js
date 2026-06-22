export const rolePower = {
  ceo: 500,
  super_admin: 400,
  admin: 300,
  moderator: 200,
  user: 100,
};

export const roleColors = {
  ceo: "cyan",
  super_admin: "red",
  admin: "pink",
  moderator: "yellow",
  user: "default",
};

export const hasRole = (user, required) => {
  const userPower = rolePower[user?.role || "user"] || 0;
  const requiredPower = rolePower[required] || 0;
  return userPower >= requiredPower;
};
