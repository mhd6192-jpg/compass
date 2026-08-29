import type { PrismaClient } from "@prisma/client";
import { generateSkeleton } from "./skeleton";
import { generateRoundRobin } from "./roundRobin";
import { generateTwoGroup, MIN_TWO_GROUP_TEAMS } from "./twoGroup";
import { rebalanceCourts, DEFAULT_COURT_IDS } from "./courts";
import { TiebreakMode, TournamentFormat } from "../types";
import { resetV2State } from "../v2/reset";

export type { TournamentFormat };

export interface SeedOptions {
  bestOfSets: number;
  tiebreakMode: TiebreakMode;
  /** Points target for the race formats. 0/undefined = the historical default. */
  raceTarget?: number;
  /** Serve changes hands every N points in a race. 0/undefined = the house default of 4. */
  serveEvery?: number;
  pin: string;
  format?: TournamentFormat;
  discipline?: string;
  /** Court numbers this tournament runs on, e.g. [1,2] or [2,3,4]. */
  courtIds?: number[];
}

export async function seedTournament(client: PrismaClient, names: string[], opts: SeedOptions) {
  const format: TournamentFormat = opts.format ?? "compass";
  const trimmed = names.map((n) => n.trim()).filter(Boolean);
  if (format === "compass" && trimmed.length !== 16) {
    throw new Error(`Exactly 16 player names are required, got ${trimmed.length}`);
  }
  if (format === "round-robin" && trimmed.length < 3) {
    throw new Error(`At least 3 teams are required for a round-robin, got ${trimmed.length}`);
  }
  if (format === "two-group" && trimmed.length < MIN_TWO_GROUP_TEAMS) {
    throw new Error(`At least ${MIN_TWO_GROUP_TEAMS} teams are required for two groups, got ${trimmed.length}`);
  }

  return client.$transaction(
    async (tx) => {
      const existing = await tx.tournamentConfig.findUnique({ where: { id: "default" } });
      if (existing && existing.status !== "setup") {
        throw new Error("Tournament already started — cannot re-seed");
      }

      await tx.pointEvent.deleteMany({});
      await tx.match.deleteMany({});
      await tx.player.deleteMany({});
      // Wipe stale court rows too — a prior tournament may have used a different court count.
      await tx.court.deleteMany({});
      // ...and the v2 screen state, or the court TVs open on the previous
      // event's awards ceremony instead of tonight's first match.
      await resetV2State(tx);

      const players = [];
      for (let i = 0; i < trimmed.length; i++) {
        players.push(await tx.player.create({ data: { name: trimmed[i], seed: i } }));
      }

      const courtIds = opts.courtIds?.length ? [...new Set(opts.courtIds)].sort((a, b) => a - b) : DEFAULT_COURT_IDS;
      for (const courtId of courtIds) {
        await tx.court.upsert({
          where: { id: courtId },
          update: {},
          create: { id: courtId, label: `Court ${courtId}` },
        });
      }

      const nodes =
        format === "compass"
          ? generateSkeleton(players.map((p) => p.id))
          : format === "two-group"
          ? generateTwoGroup(players.length)
          : generateRoundRobin(players.length);
      const keyToId = new Map<string, string>();

      for (const node of nodes) {
        const data: Record<string, unknown> = {
          bracket: node.bracket,
          round: node.round,
          posIndex: node.posIndex,
          isBracketFinal: node.isBracketFinal,
          status: "pending",
        };
        if (node.initialPlayerSeeds) {
          data.player1Id = players[node.initialPlayerSeeds[0]].id;
          data.player2Id = players[node.initialPlayerSeeds[1]].id;
          data.status = "ready";
          data.readyAt = new Date();
        }
        const row = await tx.match.create({ data: data as never });
        keyToId.set(node.key, row.id);
      }

      for (const node of nodes) {
        const data: Record<string, unknown> = {};
        if (node.feedWinnerKey) {
          data.feedWinnerMatchId = keyToId.get(node.feedWinnerKey);
          data.feedWinnerSlot = node.feedWinnerSlot;
        }
        if (node.feedLoserKey) {
          data.feedLoserMatchId = keyToId.get(node.feedLoserKey);
          data.feedLoserSlot = node.feedLoserSlot;
        }
        if (Object.keys(data).length > 0) {
          await tx.match.update({ where: { id: keyToId.get(node.key)! }, data: data as never });
        }
      }

      await tx.tournamentConfig.upsert({
        where: { id: "default" },
        update: {
          status: "active",
          format,
          discipline: opts.discipline === "singles" ? "singles" : "doubles",
          bestOfSets: opts.bestOfSets,
          tiebreakMode: opts.tiebreakMode,
          raceTarget: opts.raceTarget ?? 0,
          serveEvery: opts.serveEvery ?? 0,
          pin: opts.pin,
          startedAt: new Date(),
        },
        create: {
          id: "default",
          status: "active",
          format,
          discipline: opts.discipline === "singles" ? "singles" : "doubles",
          bestOfSets: opts.bestOfSets,
          tiebreakMode: opts.tiebreakMode,
          raceTarget: opts.raceTarget ?? 0,
          serveEvery: opts.serveEvery ?? 0,
          pin: opts.pin,
          startedAt: new Date(),
        },
      });

      await rebalanceCourts(tx);
    },
    { timeout: 20000 }
  );
}
