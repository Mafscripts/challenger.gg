export const activisionIdFor = (user) => String(user?.activision_id || "").trim();

export const hasActivisionId = (user) => Boolean(activisionIdFor(user));

export const activisionIdRequiredMessage = (
  "Add your Activision ID in Settings > Gaming IDs before joining or creating competitive matches."
);
