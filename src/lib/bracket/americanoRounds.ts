import type { Match, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export function isAmericanoRow(m: Pick<Match, "bracket">): boolean {
  return m.bracket === "AM";
}

/**
 * Opens the next round of an americano once the current one is finished.
 *
 * Every match of the night is generated up front, but only one round is ever
 * playable at a time. Without that gate the court queue would happily start a
 * round-five match the moment its four players were free, and the rotation
 * stops meaning anything: people would be called for their sixth match while
 * someone else is still waiting for their second, and the "round" a player is
 * told to look out for would not match what is on the court.
 *
 * Idempotent, so it is safe to call after every completed match: it only ever
 * opens the single lowest round that is still held back, and only once every
 * match before it has actually been played.
 */
export async function openNextAmericanoRound(tx: Tx): Promise<string[]> {
  const cfg = await tx.tournamentConfig.findUnique({ where: { id: "default" } });
  if (cfg?.format !== "americano") return [];

  const unfinished = await tx.match.findFirst({
    where: { bracket: "AM", status: { not: "completed" }, NOT: { status: "pending" } },
  });
  if (unfinished) return []; // the open round is still being played

  const nextRound = await tx.match.findFirst({
    where: { bracket: "AM", status: "pending" },
    orderBy: { round: "asc" },
    select: { round: true },
  });
  if (!nextRound) return []; // the whole americano is done

  const opening = await tx.match.findMany({
    where: { bracket: "AM", status: "pending", round: nextRound.round },
    select: { id: true },
  });
  await tx.match.updateMany({
    where: { id: { in: opening.map((m) => m.id) } },
    data: { status: "ready", readyAt: new Date() },
  });
  return opening.map((m) => m.id);
}

/**
 * Undo support: reopening a match closes any round that was let through by it.
 *
 * The reopened match is part of the round that should be current again, so
 * anything from a later round has to go back to being held. Refuses once a
 * later round has actually started — those points are somebody's real match,
 * and silently deleting them to tidy up the rotation would be far worse than
 * telling the organiser they cannot undo this one.
 */
export async function closeLaterAmericanoRounds(tx: Tx, round: number): Promise<string[]> {
  const later = await tx.match.findMany({ where: { bracket: "AM", round: { gt: round } } });
  if (later.length === 0) return [];

  const started = later.filter((m) => m.status === "completed" || m.status === "in_progress");
  if (started.length > 0) {
    throw new Error("Cannot undo: a later round of the americano has already started.");
  }
  const open = later.filter((m) => m.status !== "pending");
  if (open.length === 0) return [];

  await tx.match.updateMany({
    where: { id: { in: open.map((m) => m.id) } },
    data: { status: "pending", readyAt: null, courtId: null, courtSlot: null },
  });
  return open.map((m) => m.id);
}
