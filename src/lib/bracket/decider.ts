import type { Match, Prisma } from "@prisma/client";
import type { ScoringConfig } from "../scoring/engine";
import { computeStandings } from "../standings";
import { MATCH_INCLUDE, buildMatchDTO } from "./dto";

type Tx = Prisma.TransactionClient;

/** Round 2 of a round robin is the title play-off — nothing else lives there. */
export function isDeciderRow(m: Pick<Match, "bracket" | "round">): boolean {
  return m.bracket === "RR" && m.round > 1;
}

async function loadGroupDTOs(tx: Tx, config: ScoringConfig) {
  const rows = await tx.match.findMany({
    include: MATCH_INCLUDE,
    orderBy: [{ round: "asc" }, { posIndex: "asc" }],
  });
  return { rows, dtos: rows.map((m) => buildMatchDTO(m, config)) };
}

/**
 * Called the moment a round-robin group match completes. If that was the last
 * one and the table is level on wins at the top, creates a single extra match
 * between the two leaders: the winner takes first place, the loser second.
 *
 * With three or more teams level, the two with the most points scored play it —
 * the same tiebreak the table already uses — so there is always exactly one
 * deciding match rather than a whole mini-bracket.
 *
 * Idempotent: does nothing if a play-off already exists, or if the group is
 * unfinished, or if the leader is clear.
 */
export async function ensureDecider(tx: Tx, config: ScoringConfig): Promise<string | null> {
  const cfg = await tx.tournamentConfig.findUnique({ where: { id: "default" } });
  if (cfg?.format !== "round-robin") return null;

  const { rows, dtos } = await loadGroupDTOs(tx, config);
  if (rows.some((m) => isDeciderRow(m))) return null; // already created
  if (rows.some((m) => !isDeciderRow(m) && m.status !== "completed")) return null; // group still running

  const standings = computeStandings(dtos);
  const [first, second] = standings;
  if (!first || !second || first.won !== second.won) return null; // outright winner

  const created = await tx.match.create({
    data: {
      bracket: "RR",
      round: 2,
      posIndex: 0,
      player1Id: first.id,
      player2Id: second.id,
      status: "ready",
      readyAt: new Date(),
      isBracketFinal: true,
    },
  });
  return created.id;
}

/**
 * Undo support: reopening the group match that triggered the play-off has to
 * take the play-off with it, or the table would be ranked against a match that
 * should no longer exist. Refuses once the play-off is under way, matching how
 * undo already guards matches that players have advanced into.
 */
export async function removeUnplayedDecider(tx: Tx): Promise<string[]> {
  const decider = await tx.match.findFirst({ where: { bracket: "RR", round: { gt: 1 } } });
  if (!decider) return [];
  const points = await tx.pointEvent.count({ where: { matchId: decider.id } });
  if (decider.status === "completed" || points > 0) {
    throw new Error("Cannot undo: the deciding final has already started.");
  }
  await tx.match.delete({ where: { id: decider.id } });
  return [decider.id];
}
