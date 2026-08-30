import type { PrismaClient } from "@prisma/client";
import { generateSkeleton } from "./skeleton";
import { generateRoundRobin } from "./roundRobin";
import { generateTwoGroup, MIN_TWO_GROUP_TEAMS } from "./twoGroup";
import { defaultRounds, generateAmericano, playersPerRound, MIN_AMERICANO_PLAYERS } from "./americano";
import { pairByRank, MIN_MEXICANO_PLAYERS } from "./mexicano";
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
  /** Americano only: how many rounds of rotating partners to schedule. */
  amRounds?: number;
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
  if (format === "americano" && trimmed.length < MIN_AMERICANO_PLAYERS) {
    throw new Error(`At least ${MIN_AMERICANO_PLAYERS} players are required for an americano, got ${trimmed.length}`);
  }
  if (format === "mexicano" && trimmed.length < MIN_MEXICANO_PLAYERS) {
    throw new Error(`At least ${MIN_MEXICANO_PLAYERS} players are required for a mexicano, got ${trimmed.length}`);
  }
  const rotating = format === "americano" || format === "mexicano";
  const amRounds = rotating ? opts.amRounds || defaultRounds(trimmed.length) : 0;

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

      // The rotating-partner formats have no bracket to wire — just rounds of
      // four-player matches. Only round 1 is playable either way, so the
      // evening runs in the order the format intends rather than the court
      // queue pulling a later round forward because those players are free
      // (see `openNextRotatingRound`).
      if (format === "americano" || format === "mexicano") {
        // An americano's whole rotation is drawn now and held back. A mexicano
        // can only know round 1: every later round is built from the standings
        // once the previous one has been played.
        const round1 =
          format === "americano"
            ? generateAmericano(players.length, amRounds).matches
            : pairByRank(playersPerRound(players.length)).map((p) => ({ ...p, round: 1 }));

        for (const m of round1) {
          const firstRound = m.round === 1;
          await tx.match.create({
            data: {
              bracket: "AM",
              round: m.round,
              posIndex: m.posIndex,
              player1Id: players[m.team1[0]].id,
              player1PartnerId: players[m.team1[1]].id,
              player2Id: players[m.team2[0]].id,
              player2PartnerId: players[m.team2[1]].id,
              status: firstRound ? "ready" : "pending",
              readyAt: firstRound ? new Date() : null,
            },
          });
        }
        await seedConfig(tx);
        await rebalanceCourts(tx);
        return;
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

      // Shared by both paths above; americano returns early, having no feed wiring.
      async function seedConfig(tx2: typeof tx) {
        await tx2.tournamentConfig.upsert({
          where: { id: "default" },
          update: {
            status: "active",
            format,
            discipline: opts.discipline === "singles" ? "singles" : "doubles",
            bestOfSets: opts.bestOfSets,
            tiebreakMode: opts.tiebreakMode,
            raceTarget: opts.raceTarget ?? 0,
            serveEvery: opts.serveEvery ?? 0,
            amRounds,
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
            amRounds,
            pin: opts.pin,
            startedAt: new Date(),
          },
        });
      }

      await seedConfig(tx);

      await rebalanceCourts(tx);
    },
    { timeout: 20000 }
  );
}
