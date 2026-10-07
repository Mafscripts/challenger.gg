-- Separate Free 8s ELO from legacy rating and Money 8s. Existing players
-- start at zero; historical matches are not retroactively scored.
ALTER TABLE "EightsStats" ADD COLUMN "free_eights_elo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EightsStats" ADD CONSTRAINT "EightsStats_free_eights_elo_nonnegative" CHECK ("free_eights_elo" >= 0);
