import { prisma } from "./prisma.js";

export const ANIMATED_NAME_FREE_TRIAL_KEY = "animated_name_effects";

export const freeTrialStatusFor = (program) => {
  const endsAt = program?.ends_date ? new Date(program.ends_date) : null;
  const active = Boolean(program?.enabled && endsAt && Number.isFinite(endsAt.getTime()) && endsAt > new Date());
  return {
    key: ANIMATED_NAME_FREE_TRIAL_KEY,
    enabled: Boolean(program?.enabled),
    active,
    starts_date: program?.starts_date ? new Date(program.starts_date).toISOString() : null,
    ends_date: endsAt && Number.isFinite(endsAt.getTime()) ? endsAt.toISOString() : null,
    stopped_date: program?.stopped_date ? new Date(program.stopped_date).toISOString() : null,
    updated_by: program?.updated_by || null,
    updated_by_name: program?.updated_by_name || null,
  };
};

export const getAnimatedNameFreeTrial = async () => {
  const program = await prisma.freeTrialProgram.findUnique({
    where: { key: ANIMATED_NAME_FREE_TRIAL_KEY },
  });
  return freeTrialStatusFor(program);
};
