import type { Match, Prisma } from "@prisma/client";
import { computeStandings } from "../standings";
import { isDerivedRounds, isRotatingPartners } from "../types";
import { nextLadder, type CourtResult } from "./kingCourt";
import { nextRound, type WinnerCourtResult } from "./winnerCourt";
import { chooseSitters, pairByRank } from "./mexicano";
import { pairAcrossRanked } from "./mixedMexicano";
import { MATCH_INCLUDE, buildMatchDTO } from "./dto";
import { getScoringConfig } from "./config";
import { applyStandIns } from "./standIns";

type Tx = Prisma.TransactionClient;

/** A round of any rotating-partner format — they all share the AM bracket. */
export function isRotatingRow(m: Pick<Match, "bracket">): boolean {
  return m.bracket === "AM";
}

/**
 * Lets the next round out once the current one is finished.
 *
 * Every rotating format plays strictly one round at a time. Without that gate
 * the court queue would start a round-five match the moment those four players
 * were free, and the round a player is told to watch for would not match what
 * is on the court.
 *
 * They differ only in where the next round comes from:
 *
 *   americano, team americano, mixicano — the whole schedule is drawn at
 *     seeding time and simply held back a round at a time.
 *   mexicano — the field is re-ranked on points and re-drawn.
 *   mixed mexicano — the same, with each group ranked separately so pairs can
 *     still cross the divide.
 *   king of the court — each set of winners moves up a rung, each set of losers
 *     down one.
 *   winner court — the winning pair keeps the court and the next two come off
 *     the queue.
 *
 * All but the first group can only be worked out once the previous round is in,
 * which is exactly what makes them worth playing.
 *
 * Idempotent, so it is safe to call after every completed match.
 */
export async function openNextRotatingRound(tx: Tx): Promise<string[]> {
  const cfg = await tx.tournamentConfig.findUnique({ where: { id: "default" } });
  if (!isRotatingPartners(cfg?.format)) return [];

  const unfinished = await tx.match.findFirst({
    where: { bracket: "AM", status: { notIn: ["completed", "pending"] } },
  });
  if (unfinished) return []; // the open round is still being played

  // --- americano: the whole draw exists, just held back ---------------------
  const held = await tx.match.findFirst({
    where: { bracket: "AM", status: "pending" },
    orderBy: { round: "asc" },
    select: { round: true },
  });
  if (held) {
    const opening = await tx.match.findMany({
      where: { bracket: "AM", status: "pending", round: held.round },
      select: { id: true },
    });
    await tx.match.updateMany({
      where: { id: { in: opening.map((m) => m.id) } },
      data: { status: "ready", readyAt: new Date() },
    });
    return opening.map((m) => m.id);
  }

  // --- the derived formats: build the next round from what just happened ----
  if (!isDerivedRounds(cfg?.format)) return [];

  const lastRound = await tx.match.aggregate({ where: { bracket: "AM" }, _max: { round: true } });
  const played = lastRound._max.round ?? 0;
  if (played === 0) return []; // nothing seeded yet
  if (played >= (cfg?.amRounds || 0)) return []; // the night is done

  const rows = await tx.match.findMany({ where: { bracket: "AM" }, include: MATCH_INCLUDE });
  if (rows.some((m) => m.status !== "completed")) return [];

  const round = played + 1;

  // --- winner court: the winning pair holds, the queue supplies the next ----
  if (cfg?.format === "winner-court") {
    // Everyone who was ever entered, including anybody who has since been
    // replaced. The queue is replayed from results that name the players who
    // actually played, so leaving them in is what keeps the replay honest —
    // the stand-in is swapped in at the end instead.
    const roster = await tx.player.findMany({ orderBy: { seed: "asc" }, select: { id: true } });
    const history: WinnerCourtResult[] = [...rows]
      .sort((a, b) => a.round - b.round)
      .map((m) => {
        const side1: [string, string] = [m.player1Id!, m.player1PartnerId!];
        const side2: [string, string] = [m.player2Id!, m.player2PartnerId!];
        const side1Won = m.winnerId === m.player1Id;
        return { winners: side1Won ? side1 : side2, losers: side1Won ? side2 : side1 };
      });
    if (history.some((r) => [...r.winners, ...r.losers].some((x) => !x))) return [];

    const next = nextRound(
      roster.map((p) => p.id),
      history
    );
    if (!next) return [];

    const row = await tx.match.create({
      data: {
        bracket: "AM",
        round,
        posIndex: 0, // only ever one match on
        player1Id: next.team1[0],
        player1PartnerId: next.team1[1],
        player2Id: next.team2[0],
        player2PartnerId: next.team2[1],
        status: "ready",
        readyAt: new Date(),
      },
    });
    await applyStandIns(tx, [row.id]);
    return [row.id];
  }

  // --- king of the court: winners climb a rung, losers drop one -------------
  if (cfg?.format === "king-court") {
    const justPlayed = rows
      .filter((m) => m.round === played)
      .sort((a, b) => a.posIndex - b.posIndex);

    const results: CourtResult[] = justPlayed.map((m) => {
      const side1: [string, string] = [m.player1Id!, m.player1PartnerId!];
      const side2: [string, string] = [m.player2Id!, m.player2PartnerId!];
      // `winnerId` names the winning side's first player, never the side itself.
      const side1Won = m.winnerId === m.player1Id;
      return { winners: side1Won ? side1 : side2, losers: side1Won ? side2 : side1 };
    });
    if (results.some((r) => r.winners.some((x) => !x) || r.losers.some((x) => !x))) return [];

    const created: string[] = [];
    for (const rung of nextLadder(results)) {
      const row = await tx.match.create({
        data: {
          bracket: "AM",
          round,
          // The rung IS the position: posIndex 0 is the king court, and the
          // screens read the court's name back off it.
          posIndex: rung.level,
          player1Id: rung.team1[0],
          player1PartnerId: rung.team1[1],
          player2Id: rung.team2[0],
          player2PartnerId: rung.team2[1],
          status: "ready",
          readyAt: new Date(),
        },
      });
      created.push(row.id);
    }
    await applyStandIns(tx, created);
    return created;
  }

  // --- the standings-driven formats: mexicano and mixed mexicano ------------

  const config = await getScoringConfig(tx);
  const table = computeStandings(rows.map((m) => buildMatchDTO(m, config)));
  const byId = new Map(table.map((r) => [r.id, r]));

  // Rank the WHOLE roster, not just the players the table knows about.
  // `computeStandings` only lists people who have appeared in a match, so
  // ranking off it alone drops anyone who sat out the opening round — and once
  // they are missing there is no bye to hand out, the same four pairs get drawn
  // again, and those players never get on court all night.
  // Only the players still here. This is where a withdrawal takes effect and
  // where somebody who joined late first appears.
  const roster = await tx.player.findMany({ where: { withdrawnAt: null }, orderBy: { seed: "asc" } });
  const byStanding = (a: { id: string; seed: number }, b: { id: string; seed: number }) => {
    const ra = byId.get(a.id);
    const rb = byId.get(b.id);
    return (
      (rb?.pointsFor ?? 0) - (ra?.pointsFor ?? 0) ||
      (rb?.won ?? 0) - (ra?.won ?? 0) ||
      (ra?.pointsAgainst ?? 0) - (rb?.pointsAgainst ?? 0) ||
      a.seed - b.seed
    );
  };
  const rankedIds = [...roster].sort(byStanding).map((p) => p.id);
  if (rankedIds.length < 4) return [];

  // --- mixed mexicano: the same redraw, but pairs cross the two groups ------
  // Each group is ranked on its own, so "the top court" means the best two of
  // each group rather than the best four overall — which is the thing a player
  // can see and aim at when every pair has to be one from each side.
  if (cfg?.format === "mixed-mexicano") {
    const rankedA = [...roster].filter((p) => p.team === 1).sort(byStanding).map((p) => p.id);
    const rankedB = [...roster].filter((p) => p.team === 2).sort(byStanding).map((p) => p.id);
    const created: string[] = [];
    for (const pairing of pairAcrossRanked(rankedA, rankedB)) {
      const row = await tx.match.create({
        data: {
          bracket: "AM",
          round,
          posIndex: pairing.posIndex,
          player1Id: pairing.team1[0],
          player1PartnerId: pairing.team1[1],
          player2Id: pairing.team2[0],
          player2PartnerId: pairing.team2[1],
          status: "ready",
          readyAt: new Date(),
        },
      });
      created.push(row.id);
    }
    await applyStandIns(tx, created);
    return created;
  }

  // Byes so far, so the sit-outs keep going round rather than always landing on
  // the same people. A player who has played every round has taken none.
  const byes = new Map<string, number>();
  for (const id of rankedIds) byes.set(id, played - (byId.get(id)?.played ?? 0));

  const sitting = chooseSitters(rankedIds, byes, rankedIds.length % 4);
  const active = rankedIds.filter((id) => !sitting.has(id));

  const created: string[] = [];
  for (const p of pairByRank(active.length)) {
    const row = await tx.match.create({
      data: {
        bracket: "AM",
        round,
        posIndex: p.posIndex,
        player1Id: active[p.team1[0]],
        player1PartnerId: active[p.team1[1]],
        player2Id: active[p.team2[0]],
        player2PartnerId: active[p.team2[1]],
        status: "ready",
        readyAt: new Date(),
      },
    });
    created.push(row.id);
  }
  await applyStandIns(tx, created);
  return created;
}

/**
 * Undo support: reopening a match closes any round that was let through by it.
 *
 * For an americano the later round goes back to being held. For the derived
 * formats it is deleted outright, because those pairings were worked out FROM a
 * result that just changed — keeping them would leave the draw showing a ladder
 * or a table that no longer justifies it. Either way this refuses once a later
 * round has actually started:
 * those points are somebody's real match, and quietly deleting them to tidy up
 * the rotation would be far worse than telling the organiser they cannot undo.
 */
export async function closeLaterRotatingRounds(tx: Tx, round: number): Promise<string[]> {
  const cfg = await tx.tournamentConfig.findUnique({ where: { id: "default" } });
  const later = await tx.match.findMany({ where: { bracket: "AM", round: { gt: round } } });
  if (later.length === 0) return [];

  const started = later.filter((m) => m.status === "completed" || m.status === "in_progress");
  if (started.length > 0) {
    throw new Error("Cannot undo: a later round has already started.");
  }

  const ids = later.map((m) => m.id);
  if (isDerivedRounds(cfg?.format)) {
    await tx.match.deleteMany({ where: { id: { in: ids } } });
    return ids;
  }

  const open = later.filter((m) => m.status !== "pending");
  if (open.length === 0) return [];
  await tx.match.updateMany({
    where: { id: { in: open.map((m) => m.id) } },
    data: { status: "pending", readyAt: null, courtId: null, courtSlot: null },
  });
  return open.map((m) => m.id);
}
