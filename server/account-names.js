const namesFor = names => [...new Set(names.filter(Boolean).map(name => name.trim().toLowerCase()))].sort();

// Every name writer takes these locks inside its transaction. A username and a
// display name share one namespace, including registrations arriving together.
export async function lockAccountNames(tx, names) {
  for (const name of namesFor(names)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account-name:${name}`}))`;
}

export async function ensureAccountNamesAvailable(db, names, userId) {
  for (const name of namesFor(names)) {
    const existing = await db.user.findFirst({ where: {
      ...(userId ? { id: { not: userId } } : {}),
      OR: ["username", "handle", "display_name", "full_name"].map(field => ({ [field]: { equals: name, mode: "insensitive" } })),
    }, select: { id: true } });
    if (existing) throw Object.assign(new Error("This name is already taken. Choose a different username or display name."), { status: 409, code: "ACCOUNT_NAME_TAKEN" });
  }
}
