import { prisma } from "./prisma.js";

export const entityAliases = {
  SupportTicket: "supportTicket",
  Ticket: "ticket",
  BanRecord: "banRecord",
  Ban: "ban",
  XPStats: "xPStats",
  XPLeaderboard: "xPLeaderboard",
};

const lowerFirst = (value) => `${value.charAt(0).toLowerCase()}${value.slice(1)}`;

export const delegateNameFor = (entity) => entityAliases[entity] || lowerFirst(entity);

export const delegateFor = (entity) => {
  const delegateName = delegateNameFor(entity);
  const delegate = prisma[delegateName];
  if (!delegate) {
    const error = new Error(`Unknown entity: ${entity}`);
    error.status = 404;
    throw error;
  }
  return delegate;
};

const dateToString = (value) => value instanceof Date ? value.toISOString() : value;

export const serializeRow = (row) => {
  if (!row) return null;
  const { metadata, password_hash, ...rest } = row;
  const serialized = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [key, dateToString(value)])
  );
  return {
    ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}),
    ...serialized,
  };
};

const userFields = new Set([
  "email",
  "password_hash",
  "username",
  "handle",
  "display_name",
  "full_name",
  "role",
  "admin_role",
  "is_admin",
  "email_verified",
  "credits",
  "wallet_balance",
  "lifetime_earnings",
  "trophies",
  "rank",
  "division",
  "xp_level",
  "wager_wins",
  "wager_losses",
  "current_win_streak",
  "total_wager_earnings",
  "biggest_wager_win",
  "tournament_wins",
  "region",
  "is_premium",
  "premium_expires",
  "is_banned",
  "ban_reason",
  "account_created_date",
]);

const toDate = (value) => value ? new Date(value) : null;
const directEntityFields = new Set(["id", "created_date", "updated_date"]);

const sortRows = (rows, order) => {
  if (!order) return rows;
  const desc = String(order).startsWith("-");
  const field = desc ? String(order).slice(1) : String(order);
  return [...rows].sort((a, b) => {
    const av = a[field] ?? "";
    const bv = b[field] ?? "";
    if (av === bv) return 0;
    return (av > bv ? 1 : -1) * (desc ? -1 : 1);
  });
};

const orderByFor = (entity, order) => {
  if (!order) return entity === "Notification" ? { created_date: "desc" } : undefined;
  const desc = String(order).startsWith("-");
  const field = desc ? String(order).slice(1) : String(order);
  if (directEntityFields.has(field) || (entity === "User" && userFields.has(field))) {
    return { [field]: desc ? "desc" : "asc" };
  }
  return undefined;
};

const notificationWhereFor = (filter = {}) => {
  const userId = filter?.user_id;
  if (!userId) return undefined;
  return {
    metadata: {
      path: ["user_id"],
      equals: userId,
    },
  };
};

export const dataForEntity = (entity, payload = {}, existingMetadata = {}) => {
  if (entity !== "User") {
    return {
      metadata: {
        ...(existingMetadata || {}),
        ...payload,
      },
    };
  }

  const data = {};
  const metadata = { ...(existingMetadata || {}) };
  Object.entries(payload).forEach(([key, value]) => {
    if (userFields.has(key)) {
      data[key] = key.endsWith("_date") || key === "premium_expires" ? toDate(value) : value;
    } else {
      metadata[key] = value;
    }
  });
  data.metadata = metadata;
  return data;
};

export const createEntity = async (entity, payload = {}) => {
  const row = await delegateFor(entity).create({ data: dataForEntity(entity, payload) });
  return serializeRow(row);
};

export const updateEntity = async (entity, id, payload = {}) => {
  const delegate = delegateFor(entity);
  const current = await delegate.findUnique({ where: { id } });
  if (!current) {
    const error = new Error(`${entity} not found`);
    error.status = 404;
    throw error;
  }
  const row = await delegate.update({
    where: { id },
    data: dataForEntity(entity, payload, current.metadata),
  });
  return serializeRow(row);
};

export const getEntity = async (entity, id) => {
  const row = await delegateFor(entity).findUnique({ where: { id } });
  if (!row) {
    const error = new Error(`${entity} not found`);
    error.status = 404;
    throw error;
  }
  return serializeRow(row);
};

export const listEntities = async (entity, filter = {}, order, limit = 100) => {
  const take = Math.min(Number(limit) || 100, 500);
  const delegate = delegateFor(entity);
  const orderBy = orderByFor(entity, order);
  const rows = entity === "Notification"
    ? await delegate.findMany({
      where: notificationWhereFor(filter),
      ...(orderBy ? { orderBy } : {}),
      take,
    })
    : await delegate.findMany({
      ...(orderBy ? { orderBy } : {}),
      take: 500,
    });
  let flattened = rows.map(serializeRow);

  flattened = flattened.filter((row) => Object.entries(filter || {}).every(([key, value]) => {
    if (value === undefined || value === null || value === "") return true;
    return String(row[key] ?? "") === String(value);
  }));

  if (order && !orderBy) flattened = sortRows(flattened, order);

  return flattened.slice(0, take);
};

export const deleteEntity = async (entity, id) => {
  await delegateFor(entity).delete({ where: { id } });
  return { success: true };
};

export const firstEntity = async (entity, filter = {}, order) => {
  const rows = await listEntities(entity, filter, order, 1);
  return rows[0] || null;
};
