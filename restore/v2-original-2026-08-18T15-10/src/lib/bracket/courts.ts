import type { Prisma, PrismaClient } from "@prisma/client";
import { pickNextMatch, PlayerLoad } from "./pickNext";

type DB = PrismaClient | Prisma.TransactionClient;

/** Fallback only — the courts actually in play are whichever Court rows the
 * organiser selected at setup, read via `getCourtIds`. */
export const DEFAULT_COURT_IDS = [2, 3];

/** The courts this tournament is being played on, in order. Derived from the
 * Court table so an organiser can run on any set of courts (1 and 4, three
 * courts, etc.) without a code change. */
export async function getCourtIds(prisma: DB): Promise<number[]> {
  const rows = await prisma.court.findMany({ orderBy: { id: "asc" }, select: { id: true } });
  return rows.length ? rows.map((c) => c.id) : DEFAULT_COURT_IDS;
}

/** How much each player has played and when they last finished — drives the
 * rest-aware ordering in `pickNextMatch`, so the same pair doesn't get called
 * straight back onto a court after finishing. */
async function getPlayerLoad(prisma: DB): Promise<PlayerLoad> {
  const done = await prisma.match.findMany({
    where: { status: "completed" },
    select: { player1Id: true, player2Id: true, completedAt: true },
  });
  const lastFinishedAt = new Map<string, number>();
  const playedCount = new Map<string, number>();
  for (const m of done) {
    const t = m.completedAt ? m.completedAt.getTime() : 0;
    for (const pid of [m.player1Id, m.player2Id]) {
      if (!pid) continue;
      playedCount.set(pid, (playedCount.get(pid) ?? 0) + 1);
      lastFinishedAt.set(pid, Math.max(lastFinishedAt.get(pid) ?? 0, t));
    }
  }
  return { lastFinishedAt, playedCount };
}

/** Players currently tied up in a match that's on a court (current/next) or
 * already being played. In a single-elimination bracket a player can never
 * have two matches "ready" at once, so this never mattered before — but in a
 * round-robin, every match is ready from the moment the draw is seeded, so
 * without this check the same team could get double/triple-booked onto
 * multiple courts simultaneously. */
async function getBusyPlayerIds(prisma: DB): Promise<Set<string>> {
  // A completed match keeps its courtId (for history/display) even though the
  // court itself is free again — must exclude "completed" here, or a player's
  // very first finished match would mark them busy forever and no new match
  // could ever be scheduled for them.
  const busy = await prisma.match.findMany({
    where: { status: { not: "completed" }, courtId: { not: null } },
    select: { player1Id: true, player2Id: true },
  });
  const ids = new Set<string>();
  for (const m of busy) {
    if (m.player1Id) ids.add(m.player1Id);
    if (m.player2Id) ids.add(m.player2Id);
  }
  return ids;
}

/**
 * Idempotent court-queue rebalance. Call after any state change that could
 * free a court slot or add a newly-ready match: a match completing, a match
 * becoming "ready" (both players known), or a manual reassignment.
 *
 * Rules: for each court, if "current" is empty, promote "next" into it. Then
 * fill any empty current/next slots (in court-id order) from the pool of
 * ready-and-unassigned matches, picking the pair that has rested longest
 * (see `pickNextMatch`) rather than strict FIFO.
 *
 * Returns the ids of matches whose courtId/courtSlot/status changed.
 */
export async function rebalanceCourts(prisma: DB): Promise<string[]> {
  const changed: string[] = [];
  const courtIds = await getCourtIds(prisma);

  for (const courtId of courtIds) {
    const current = await prisma.match.findFirst({ where: { courtId, courtSlot: "current" } });
    if (!current) {
      const next = await prisma.match.findFirst({ where: { courtId, courtSlot: "next" } });
      if (next) {
        await prisma.match.update({ where: { id: next.id }, data: { courtSlot: "current" } });
        changed.push(next.id);
      }
    }
  }

  // Slot-major, NOT court-major: give every court a live match before giving
  // any court a queued one. Filling court-by-court would stack both playable
  // matches onto court 2 (current + next) and leave court 3 standing empty —
  // which is exactly what happens in a small group where only two matches can
  // physically run at once.
  for (const slot of ["current", "next"] as const) {
    for (const courtId of courtIds) {
      const occupied = await prisma.match.findFirst({ where: { courtId, courtSlot: slot } });
      if (occupied) continue;

      const busy = await getBusyPlayerIds(prisma);
      const load = await getPlayerLoad(prisma);
      const candidates = await prisma.match.findMany({
        where: { status: "ready", courtId: null },
        orderBy: { readyAt: "asc" },
      });
      const nextReady = pickNextMatch(candidates, busy, load);
      if (!nextReady) continue;

      await prisma.match.update({
        where: { id: nextReady.id },
        data: { courtId, courtSlot: slot, status: "scheduled" },
      });
      changed.push(nextReady.id);
    }
  }

  // Last resort: a court with nothing to play, while another court is holding a
  // match parked in its "next" slot. Those two teams count as busy, so the ready
  // pool can't fill the empty court — the match has to be pulled across. Without
  // this a court stands idle for a whole match even though play is available.
  for (const courtId of courtIds) {
    const current = await prisma.match.findFirst({
      where: { courtId, courtSlot: "current", status: { not: "completed" } },
    });
    if (current) continue;

    const parked = await prisma.match.findFirst({
      where: { courtSlot: "next", status: { not: "completed" }, courtId: { not: courtId } },
      orderBy: { readyAt: "asc" },
    });
    if (!parked) continue;

    await prisma.match.update({
      where: { id: parked.id },
      data: { courtId, courtSlot: "current", status: parked.status === "ready" ? "scheduled" : parked.status },
    });
    changed.push(parked.id);
  }

  return changed;
}

/**
 * Manual override: place `matchId` onto `courtId`/`slot`. If that slot is
 * already occupied, the two matches swap positions (or the displaced match
 * is bumped back into the open queue if the moved match had no prior court).
 * Disallowed for completed matches.
 */
export async function manualAssignCourt(
  prisma: DB,
  matchId: string,
  courtId: number,
  slot: "current" | "next"
): Promise<string[]> {
  const source = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
  if (source.status === "completed") {
    throw new Error("Cannot reassign a completed match");
  }

  // A manual move must not put a team onto two courts at once. Ignore the
  // match being moved, and the one it is about to displace (that one is either
  // swapping into this match's old slot or going back to the queue).
  const displacedCheck = await prisma.match.findFirst({ where: { courtId, courtSlot: slot } });
  const conflict = await prisma.match.findFirst({
    where: {
      status: { not: "completed" },
      courtId: { not: null },
      id: { notIn: [source.id, ...(displacedCheck ? [displacedCheck.id] : [])] },
      OR: [
        { player1Id: source.player1Id },
        { player2Id: source.player1Id },
        { player1Id: source.player2Id },
        { player2Id: source.player2Id },
      ],
    },
    include: { player1: true, player2: true },
  });
  if (conflict) {
    throw new Error(
      `Cannot place this match: a team is already on court ${conflict.courtId} (${conflict.player1?.name} vs ${conflict.player2?.name}).`
    );
  }

  const displaced = displacedCheck;
  const changed: string[] = [];

  if (displaced && displaced.id !== source.id) {
    await prisma.match.update({
      where: { id: displaced.id },
      data: {
        courtId: source.courtId,
        courtSlot: source.courtSlot,
        status: source.courtId ? displaced.status : displaced.status === "scheduled" ? "ready" : displaced.status,
      },
    });
    changed.push(displaced.id);
  }

  await prisma.match.update({
    where: { id: source.id },
    data: {
      courtId,
      courtSlot: slot,
      status: source.status === "ready" ? "scheduled" : source.status,
    },
  });
  changed.push(source.id);

  return changed;
}
