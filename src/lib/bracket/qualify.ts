import type { Match, Prisma } from "@prisma/client";
import type { ScoringConfig } from "../scoring/engine";
import { computeStandings } from "../standings";
import { buildMatchDTO } from "./dto";

type Tx = Prisma.TransactionClient;

/** A group-stage match of the two-group format. */
export function isGroupRow(m: Pick<Match, "bracket">): boolean {
  return m.bracket === "GA" || m.bracket === "GB";
}

/**
 * Called whenever a two-group match completes. Once BOTH groups are finished,
 * fills in the semifinals from the two tables: the group winners are kept apart
 * by crossing them over, so it is A1 v B2 and B1 v A2, and the winners meet in
 * the final (that wiring is already in place from seeding).
 *
 * Idempotent, and a no-op until every group match is in.
 */
export async function ensureSemifinals(tx: Tx, config: ScoringConfig): Promise<string[]> {
  const cfg = await tx.tournamentConfig.findUnique({ where: { id: "default" } });
  if (cfg?.format !== "two-group") return [];

  const rows = await tx.match.findMany({
    include: { player1: true, player2: true, points: { orderBy: { seq: "asc" } } },
    orderBy: [{ bracket: "asc" }, { posIndex: "asc" }],
  });

  const groups = rows.filter((m) => isGroupRow(m));
  if (groups.length === 0) return [];
  if (groups.some((m) => m.status !== "completed")) return []; // groups still running

  const semis = rows.filter((m) => m.bracket === "SF").sort((a, b) => a.posIndex - b.posIndex);
  if (semis.length < 2) return [];
  if (semis.some((m) => m.player1Id || m.player2Id)) return []; // already seeded

  const tableOf = (bracket: string) =>
    computeStandings(rows.filter((m) => m.bracket === bracket).map((m) => buildMatchDTO(m, config)));
  const a = tableOf("GA");
  const b = tableOf("GB");
  if (a.length < 2 || b.length < 2) return [];

  // Crossed over so the two group winners can only meet in the final.
  const pairs: [string, string][] = [
    [a[0].id, b[1].id],
    [b[0].id, a[1].id],
  ];

  const changed: string[] = [];
  for (let i = 0; i < 2; i++) {
    await tx.match.update({
      where: { id: semis[i].id },
      data: { player1Id: pairs[i][0], player2Id: pairs[i][1], status: "ready", readyAt: new Date() },
    });
    changed.push(semis[i].id);
  }
  return changed;
}

/**
 * Undo support: reopening a group match un-qualifies whoever it sent through, so
 * the semifinals go back to empty. Refuses once a semifinal is under way, the
 * same guard the compass draw uses for matches players have advanced into.
 */
export async function retractSemifinals(tx: Tx): Promise<string[]> {
  const semis = await tx.match.findMany({ where: { bracket: "SF" } });
  const seeded = semis.filter((m) => m.player1Id || m.player2Id);
  if (seeded.length === 0) return [];

  for (const s of seeded) {
    const points = await tx.pointEvent.count({ where: { matchId: s.id } });
    if (s.status === "completed" || points > 0) {
      throw new Error("Cannot undo: a semifinal has already started.");
    }
  }
  const changed: string[] = [];
  for (const s of seeded) {
    await tx.match.update({
      where: { id: s.id },
      data: { player1Id: null, player2Id: null, status: "pending", readyAt: null, courtId: null, courtSlot: null },
    });
    changed.push(s.id);
  }
  return changed;
}
