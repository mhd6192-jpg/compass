import type { Prisma, PrismaClient } from "@prisma/client";
import type { ScoringConfig } from "../scoring/engine";
import { TiebreakMode } from "../types";

/** Lives in its own module so `dto` can read the config without importing
 * `routing`, which needs `dto` back once the play-off decider is in play. */
export async function getScoringConfig(client: Prisma.TransactionClient | PrismaClient): Promise<ScoringConfig> {
  const cfg = await client.tournamentConfig.findUniqueOrThrow({ where: { id: "default" } });
  return { bestOfSets: cfg.bestOfSets, tiebreakMode: cfg.tiebreakMode as TiebreakMode };
}
