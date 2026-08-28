import type { Prisma, PrismaClient } from "@prisma/client";
import { applyPoint, computeMatchState, ScoringConfig } from "../scoring/engine";
import { ScoreInput, synthPoints } from "../scoring/synth";
import { rebalanceCourts } from "./courts";
import { ensureDecider, isDeciderRow, removeUnplayedDecider } from "./decider";
import { ensureSemifinals, isGroupRow, retractSemifinals } from "./qualify";
import { AnimationTier } from "../types";

type Tx = Prisma.TransactionClient;

export { getScoringConfig } from "./config";
import { getScoringConfig } from "./config";

async function loadPointSlots(client: Tx, matchId: string): Promise<Array<1 | 2>> {
  const points = await client.pointEvent.findMany({ where: { matchId }, orderBy: { seq: "asc" } });
  return points.map((p) => p.slot as 1 | 2);
}

async function applyPlayerToMatch(tx: Tx, targetId: string, slot: 1 | 2, playerId: string) {
  const field = slot === 1 ? "player1Id" : "player2Id";
  const target = await tx.match.update({ where: { id: targetId }, data: { [field]: playerId } });
  if (target.player1Id && target.player2Id && target.status === "pending") {
    await tx.match.update({ where: { id: targetId }, data: { status: "ready", readyAt: new Date() } });
  }
}

/** Reverses a single player-slot assignment made by propagation, used by undo. Only safe if the target match hasn't started. */
async function retractPlayerFromMatch(tx: Tx, targetId: string, slot: 1 | 2) {
  const field = slot === 1 ? "player1Id" : "player2Id";
  const target = await tx.match.findUniqueOrThrow({ where: { id: targetId } });
  const pointCount = await tx.pointEvent.count({ where: { matchId: targetId } });
  if (target.status === "completed" || pointCount > 0) {
    throw new Error("Cannot undo: the next match this player advanced to has already started.");
  }
  await tx.match.update({
    where: { id: targetId },
    data: {
      [field]: null,
      status: "pending",
      readyAt: null,
      courtId: null,
      courtSlot: null,
    },
  });
}

async function propagateResult(tx: Tx, matchId: string): Promise<string[]> {
  const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
  const affected: string[] = [];

  if (match.feedWinnerMatchId && match.winnerId && match.feedWinnerSlot) {
    await applyPlayerToMatch(tx, match.feedWinnerMatchId, match.feedWinnerSlot as 1 | 2, match.winnerId);
    affected.push(match.feedWinnerMatchId);
  }
  if (match.feedLoserMatchId && match.loserId && match.feedLoserSlot) {
    await applyPlayerToMatch(tx, match.feedLoserMatchId, match.feedLoserSlot as 1 | 2, match.loserId);
    affected.push(match.feedLoserMatchId);
  }
  return affected;
}

interface CompleteOpts {
  forced?: boolean;
  reason?: string;
}

async function completeMatch(tx: Tx, matchId: string, winnerSlot: 1 | 2, opts: CompleteOpts = {}) {
  const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
  if (match.status === "completed") throw new Error("Match already completed");
  if (!match.player1Id || !match.player2Id) throw new Error("Match is missing a player");

  const winnerId = winnerSlot === 1 ? match.player1Id : match.player2Id;
  const loserId = winnerSlot === 1 ? match.player2Id : match.player1Id;

  await tx.match.update({
    where: { id: matchId },
    data: {
      status: "completed",
      winnerId,
      loserId,
      completedAt: new Date(),
      courtSlot: null,
      forcedEnd: opts.forced ?? false,
      forcedEndReason: opts.reason ?? null,
    },
  });

  const routedIds = await propagateResult(tx, matchId);
  // Must run before the rebalance: if the group just ended level, the play-off
  // it creates needs to be in the pool when courts are handed out.
  const config = await getScoringConfig(tx);
  const deciderId = await ensureDecider(tx, config);
  const semiIds = await ensureSemifinals(tx, config);
  const courtChangedIds = await rebalanceCourts(tx);
  // A group format has no championship match — except the play-off or the final,
  // when there is one.
  const championshipWon =
    (match.bracket === "E" && match.isBracketFinal) || isDeciderRow(match) || (match.bracket === "F" && match.isBracketFinal);

  return {
    championshipWon,
    affected: [...routedIds, ...(deciderId ? [deciderId] : []), ...semiIds, ...courtChangedIds],
  };
}

export interface ScorePointResult {
  tier: AnimationTier;
  matchId: string;
  completed: boolean;
  championshipWon: boolean;
  affectedMatchIds: string[];
  /** The point was already recorded; this call changed nothing. */
  duplicate?: boolean;
}

/**
 * Records one point.
 *
 * `expectedSeq` makes the call safe to retry, which is what lets a coach keep
 * scoring on a dropped connection. The dangerous case is a request the server
 * processed and answered into a dead socket: without a sequence number the
 * phone cannot tell "never arrived" from "arrived, reply lost", and retrying
 * would silently score the point twice. With one, a replay of an already-
 * recorded point is recognised and ignored.
 *
 * Omit it and the old behaviour applies — the point is simply appended.
 */
export async function scorePoint(
  client: PrismaClient,
  matchId: string,
  slot: 1 | 2,
  expectedSeq?: number,
  tappedAt?: Date
): Promise<ScorePointResult> {
  return client.$transaction(async (tx) => {
    const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
    if (match.status === "completed") throw new Error("Match already completed");
    if (!match.player1Id || !match.player2Id) throw new Error("Match is missing a player");

    const config = await getScoringConfig(tx);
    const existingSlots = await loadPointSlots(tx, matchId);
    const seq = existingSlots.length + 1;

    if (expectedSeq !== undefined) {
      if (expectedSeq < seq) {
        // Already recorded — this is a replay of a point whose reply was lost.
        const state = computeMatchState(existingSlots, config);
        return {
          tier: "point" as AnimationTier,
          matchId,
          completed: !!state.matchWinnerSlot,
          championshipWon: false,
          affectedMatchIds: [matchId],
          duplicate: true,
        };
      }
      if (expectedSeq > seq) {
        // The phone thinks more points exist than the server has: an earlier one
        // never landed. Applying this would record the wrong score, so refuse
        // and let the client resync.
        throw new Error(`Out of step: this device recorded ${expectedSeq - 1} points, the match has ${seq - 1}.`);
      }
    }

    const before = computeMatchState(existingSlots, config);
    const { state: after, tier } = applyPoint(before, slot, config);

    await tx.pointEvent.create({ data: { matchId, seq, slot, tappedAt: tappedAt ?? null } });

    if (match.status === "scheduled") {
      await tx.match.update({ where: { id: matchId }, data: { status: "in_progress", startedAt: new Date() } });
    }

    let completed = false;
    let championshipWon = false;
    let affected: string[] = [matchId];

    if (after.matchWinnerSlot) {
      completed = true;
      const result = await completeMatch(tx, matchId, after.matchWinnerSlot);
      championshipWon = result.championshipWon;
      affected = affected.concat(result.affected);
    }

    const finalTier: AnimationTier = championshipWon ? "champion" : tier;
    return {
      tier: finalTier,
      matchId,
      completed,
      championshipWon,
      affectedMatchIds: Array.from(new Set(affected)),
    };
  });
}

/**
 * Removes the most recent point.
 *
 * `expectedLastSeq` is what makes this safe to retry, and it matters more here
 * than anywhere else: undo is the one action that destroys a real record, so a
 * request whose reply was lost and then repeated would quietly delete a second
 * point that nobody meant to touch. Passing the seq the caller believes is last
 * turns a replay into a no-op.
 */
export async function undoLastPoint(
  client: PrismaClient,
  matchId: string,
  expectedLastSeq?: number
): Promise<{ affectedMatchIds: string[]; removed: boolean }> {
  return client.$transaction(async (tx) => {
    const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
    const last = await tx.pointEvent.findFirst({ where: { matchId }, orderBy: { seq: "desc" } });
    if (!last) throw new Error("No points to undo");

    if (expectedLastSeq !== undefined && last.seq !== expectedLastSeq) {
      // The last point is not the one the caller was looking at, so their undo
      // has already been applied. Doing it again would eat a different point.
      return { affectedMatchIds: [matchId], removed: false };
    }

    let affected: string[] = [matchId];

    if (match.status === "completed") {
      // A group result that triggered the title play-off has to take it back down
      // with it — otherwise the table gets ranked against a match that shouldn't exist.
      if (!isDeciderRow(match)) {
        affected = affected.concat(await removeUnplayedDecider(tx));
      }
      // Same for the two-group format: undoing a group result un-qualifies the
      // teams it sent to the semifinals.
      if (isGroupRow(match)) {
        affected = affected.concat(await retractSemifinals(tx));
      }
      // Must retract propagation before we can safely reopen the match.
      if (match.feedWinnerMatchId && match.feedWinnerSlot) {
        await retractPlayerFromMatch(tx, match.feedWinnerMatchId, match.feedWinnerSlot as 1 | 2);
        affected.push(match.feedWinnerMatchId);
      }
      if (match.feedLoserMatchId && match.feedLoserSlot) {
        await retractPlayerFromMatch(tx, match.feedLoserMatchId, match.feedLoserSlot as 1 | 2);
        affected.push(match.feedLoserMatchId);
      }
      // Restoring this match's court slot could collide with a match already
      // promoted into it since completion. Only safe if that occupant hasn't started.
      let restoreCourtSlot: "current" | null = null;
      if (match.courtId) {
        const occupying = await tx.match.findFirst({ where: { courtId: match.courtId, courtSlot: "current" } });
        if (occupying && occupying.id !== match.id) {
          const occupyingPoints = await tx.pointEvent.count({ where: { matchId: occupying.id } });
          if (occupying.status === "completed" || occupyingPoints > 0) {
            throw new Error("Cannot undo: another match has already started on this match's court.");
          }
          await tx.match.update({
            where: { id: occupying.id },
            data: { courtId: null, courtSlot: null, status: "ready" },
          });
          affected.push(occupying.id);
        }
        restoreCourtSlot = "current";
      }

      await tx.pointEvent.delete({ where: { id: last.id } });

      const remaining = await loadPointSlots(tx, matchId);
      const config = await getScoringConfig(tx);
      const state = computeMatchState(remaining, config);

      await tx.match.update({
        where: { id: matchId },
        data: {
          status: state.totalPoints > 0 ? "in_progress" : "scheduled",
          winnerId: null,
          loserId: null,
          completedAt: null,
          forcedEnd: false,
          forcedEndReason: null,
          courtSlot: restoreCourtSlot,
        },
      });
    } else {
      await tx.pointEvent.delete({ where: { id: last.id } });
    }

    const courtChanged = await rebalanceCourts(tx);
    affected = affected.concat(courtChanged);
    return { affectedMatchIds: Array.from(new Set(affected)), removed: true };
  });
}

/**
 * Ends a match early — a retirement, an injury, a no-show.
 *
 * Safe to repeat. Completing a match propagates its winner into the next round
 * and can trigger a decider or the semifinals, so re-running it on a match that
 * is already forced-ended would push those consequences through a second time.
 * A replay of the same decision is therefore recognised and does nothing.
 */
export async function forceEndMatch(
  client: PrismaClient,
  matchId: string,
  winnerSlot: 1 | 2,
  reason: string
): Promise<{ championshipWon: boolean; affectedMatchIds: string[]; alreadyEnded: boolean }> {
  return client.$transaction(async (tx) => {
    const existing = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
    const intendedWinner = winnerSlot === 1 ? existing.player1Id : existing.player2Id;

    if (existing.status === "completed" && existing.forcedEnd && existing.winnerId === intendedWinner) {
      return { championshipWon: false, affectedMatchIds: [matchId], alreadyEnded: true };
    }

    const result = await completeMatch(tx, matchId, winnerSlot, { forced: true, reason });
    return {
      championshipWon: result.championshipWon,
      affectedMatchIds: Array.from(new Set([matchId, ...result.affected])),
      alreadyEnded: false,
    };
  });
}

export interface ManualScoreResult {
  completed: boolean;
  championshipWon: boolean;
  affectedMatchIds: string[];
}

/**
 * Replaces a match's score with a manually-entered one. `finalize` = true means
 * the entered score must complete the match (used for "end now with this score");
 * false leaves it in progress (used for "edit / correct the current score").
 *
 * Regenerates synthetic point events so everything downstream (display driver,
 * undo, DTO) stays consistent with the point-sourced model. Only works on a
 * match that hasn't been completed yet — to change a finished match, undo it first.
 */
export async function applyManualScore(
  client: PrismaClient,
  matchId: string,
  input: ScoreInput,
  finalize: boolean
): Promise<ManualScoreResult> {
  return client.$transaction(async (tx) => {
    const match = await tx.match.findUniqueOrThrow({ where: { id: matchId } });
    if (match.status === "completed") {
      throw new Error("Match is already completed — undo it first to change the score");
    }
    if (!match.player1Id || !match.player2Id) throw new Error("Match is missing a player");

    const config = await getScoringConfig(tx);
    const { slots, matchWinnerSlot } = synthPoints(input, config);

    if (finalize && matchWinnerSlot === null) {
      throw new Error("That score doesn't finish the match — add the deciding set, or use Save instead of Finish");
    }
    if (!finalize && matchWinnerSlot !== null) {
      throw new Error("That score finishes the match — use Finish match instead of Save");
    }

    // Swap in the synthetic point events.
    await tx.pointEvent.deleteMany({ where: { matchId } });
    for (let k = 0; k < slots.length; k++) {
      await tx.pointEvent.create({ data: { matchId, seq: k + 1, slot: slots[k] } });
    }

    if (finalize && matchWinnerSlot) {
      if (!match.startedAt) {
        await tx.match.update({ where: { id: matchId }, data: { startedAt: new Date() } });
      }
      const result = await completeMatch(tx, matchId, matchWinnerSlot);
      return {
        completed: true,
        championshipWon: result.championshipWon,
        affectedMatchIds: Array.from(new Set([matchId, ...result.affected])),
      };
    }

    // Partial: keep it in progress on its court.
    await tx.match.update({
      where: { id: matchId },
      data: {
        status: slots.length > 0 ? "in_progress" : match.courtId ? "scheduled" : match.status,
        startedAt: slots.length > 0 && !match.startedAt ? new Date() : match.startedAt,
      },
    });
    const courtChanged = await rebalanceCourts(tx);
    return { completed: false, championshipWon: false, affectedMatchIds: Array.from(new Set([matchId, ...courtChanged])) };
  });
}
