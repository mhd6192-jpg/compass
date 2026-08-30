import type { Match, Prisma } from "@prisma/client";
import { computeStandings } from "../standings";
import { isDerivedRounds, isRotatingPartners } from "../types";
import { nextLadder, type CourtResult } from "./kingCourt";
import { chooseSitters, pairByRank } from "./mexicano";
import { MATCH_INCLUDE, buildMatchDTO } from "./dto";
import { getScoringConfig } from "./config";

type Tx = Prisma.TransactionClient;

/** A round of a rotating-partner format (americano, mexicano or king of the court). */
export function isRotatingRow(m: Pick<Match, "bracket">): boolean {
  return m.bracket === "AM";
}

/**
 * Lets the next round out once the current one is finished.
 *
 * All three rotating formats play strictly one round at a time. Without that
 * gate the court queue would start a round-five match the moment those four
 * players were free, and the round a player is told to watch for would not
 * match what is on the court.
 *
 * They differ only in where the next round comes from. An americano has it
 * sitting there already, drawn at seeding time. A mexicano re-ranks the whole
 * field on points and re-draws. King of the court moves each set of winners up
 * a rung and each set of losers down one. The last two can only be worked out
 * once the previous round is in, which is exactly what makes them worth
 * playing.
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
    return created;
  }

  // --- mexicano: build the next round from the table ------------------------

  const config = await getScoringConfig(tx);
  const table = computeStandings(rows.map((m) => buildMatchDTO(m, config)));
  const byId = new Map(table.map((r) => [r.id, r]));

  // Rank the WHOLE roster, not just the players the table knows about.
  // `computeStandings` only lists people who have appeared in a match, so
  // ranking off it alone drops anyone who sat out the opening round — and once
  // they are missing there is no bye to hand out, the same four pairs get drawn
  // again, and those players never get on court all night.
  const roster = await tx.player.findMany({ orderBy: { seed: "asc" } });
  const rankedIds = [...roster]
    .sort((a, b) => {
      const ra = byId.get(a.id);
      const rb = byId.get(b.id);
      return (
        (rb?.pointsFor ?? 0) - (ra?.pointsFor ?? 0) ||
        (rb?.won ?? 0) - (ra?.won ?? 0) ||
        (ra?.pointsAgainst ?? 0) - (rb?.pointsAgainst ?? 0) ||
        a.seed - b.seed
      );
    })
    .map((p) => p.id);
  if (rankedIds.length < 4) return [];

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
