import type { PrismaClient } from "@prisma/client";
import { generateSkeleton } from "./skeleton";
import { generateRoundRobin } from "./roundRobin";
import { generateTwoGroup } from "./twoGroup";
import { generateAmericano, playersPerRound } from "./americano";
import { pairByRank } from "./mexicano";
import { openingLadder } from "./kingCourt";
import { generateTeamAmericano, teamOf } from "./teamAmericano";
import { generateMixicano, groupOf } from "./mixicano";
import { OPENING_INDICES } from "./winnerCourt";
import { groupOf as mixedGroupOf, openingRound as mixedOpeningRound } from "./mixedMexicano";
import { generateMixedTeamAmericano, pairGroupOf, teamOf as mixedTeamOf } from "./mixedTeamAmericano";
import { rebalanceCourts, DEFAULT_COURT_IDS } from "./courts";
import { TiebreakMode, TournamentFormat, isRotatingPartners } from "../types";
import { defaultRoundsFor, validateField } from "./formats";
import { resetV2State } from "../v2/reset";
import { resolveMembers } from "../members";

export type { TournamentFormat };

export interface SeedOptions {
  bestOfSets: number;
  tiebreakMode: TiebreakMode;
  /** Points target for the race formats. 0/undefined = the historical default. */
  raceTarget?: number;
  /** Serve changes hands every N points in a race. 0/undefined = the house default of 4. */
  serveEvery?: number;
  /** Margin needed to take a race: 0/1 = sudden death at the target, 2 = win by two. */
  raceWinBy?: number;
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
  // One validator per format, declared in ./formats — the form, the API and
  // this all read the same rule and print the same sentence.
  const invalid = validateField(format, trimmed.length);
  if (invalid) throw new Error(invalid);

  // Resolved before the transaction rather than inside it. On a database where
  // the members table has not been created yet the statement fails, and a
  // failed statement inside a transaction poisons the whole thing — which would
  // mean no draw could be seeded at all. Out here it degrades to a list of
  // nulls and the evening runs exactly as it did before members existed.
  const memberIds = await resolveMembers(client, trimmed);

  const rotating = isRotatingPartners(format);
  const amRounds = rotating ? opts.amRounds || defaultRoundsFor(format, trimmed.length) : 0;

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
        // Both two-group formats record which half of the entry list a player
        // came from; everywhere else there are no groups and team stays 0.
        const team =
          format === "mixed-team-americano"
            ? mixedTeamOf(i, trimmed.length)
            : format === "team-americano"
            ? teamOf(i, trimmed.length)
            : format === "mixicano"
            ? groupOf(i, trimmed.length)
            : format === "mixed-mexicano" || format === "mixed-americano"
            ? mixedGroupOf(i, trimmed.length)
            : 0;
        // Only the mixed team americano needs a second division: which half of
        // your own side you are allowed to partner across.
        const pairGroup = format === "mixed-team-americano" ? pairGroupOf(i, trimmed.length) : 0;
        players.push(await tx.player.create({ data: { name: trimmed[i], seed: i, team, pairGroup, memberId: memberIds[i] } }));
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
      if (rotating) {
        // An americano's whole rotation is drawn now and held back. The other
        // two can only know round 1: a mexicano's later rounds come from the
        // standings and king of the court's from who won on each rung, neither
        // of which exists until the night is under way.
        const round1 =
          // A mixed americano IS an americano — the groups change how it is
          // ranked and read, never how it is drawn.
          format === "americano" || format === "mixed-americano"
            ? generateAmericano(players.length, amRounds).matches
            : format === "team-americano"
            ? generateTeamAmericano(players.length, amRounds)
            : format === "mixicano"
            ? generateMixicano(players.length, amRounds)
            : format === "mixed-team-americano"
            ? generateMixedTeamAmericano(players.length, amRounds)
            : format === "winner-court"
            ? // Only the opening match is known: every later one depends on who
              // held the court and who is next off the queue.
              [{ round: 1, posIndex: 0, ...OPENING_INDICES }]
            : format === "mixed-mexicano"
            ? // Round 1 off the entry order within each group; later rounds are
              // redrawn from the standings.
              mixedOpeningRound(trimmed.length).map((p) => ({ round: 1, ...p }))
            : format === "king-court"
            ? // posIndex is the rung: 0 is the king court.
              openingLadder(trimmed.length).map((r) => ({ round: 1, posIndex: r.level, team1: r.team1, team2: r.team2 }))
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
          raceWinBy: opts.raceWinBy ?? 0,
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
          raceWinBy: opts.raceWinBy ?? 0,
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
