/**
 * Changing who is playing, once the evening has started.
 *
 * Every draw was fixed at the moment it was seeded, which is not how a social
 * night actually goes. Somebody turns up twenty minutes late. Somebody has to
 * leave after three rounds. Until now the only answer was to wipe the draw and
 * start again, losing everything already played — so in practice the answer was
 * to carry a player who was not there, and their matches simply never finished.
 *
 * Three things can happen, and they are not equally safe:
 *
 *   replace   somebody takes somebody else's place. The shape of the draw never
 *             changes — same field size, same slot, same group — so this works
 *             in every format, including the ones that derive each round from
 *             the last.
 *   withdraw  the field shrinks.
 *   add       the field grows.
 *
 * The last two mean redrawing what has not been played, and a format can only
 * take that if its draw is a function of the field. An americano's is. A
 * mexicano's is. King of the court builds each round from who won on each rung
 * and winner court replays a queue from the order people were entered in;
 * neither has a draw to redraw, and both are refused with that reason rather
 * than half-done. So are the grouped formats, which need their halves to stay
 * the size they were entered as.
 *
 * Two rules hold throughout:
 *
 *   Nothing already played ever changes. A withdrawn player keeps every point
 *   they earned and stays in the standings, because those matches happened.
 *
 *   The round on court plays out. Changes take effect from the next one. The
 *   alternative is pulling matches off courts mid-round, and a round that is
 *   half-played cannot be redrawn without either replaying it or leaving
 *   somebody with two goes at it.
 */
import type { Prisma } from "@prisma/client";
import { generateAmericano } from "./americano";
import { isRotatingPartners, isDerivedRounds } from "../types";
import { formatSpec } from "./formats";
import { rebalanceCourts } from "./courts";
import { resolveMembers } from "../members";
import { openNextRotatingRound } from "./rotatingRounds";
import { swapInMatches } from "./standIns";

type Tx = Prisma.TransactionClient;

export type FieldChange = "replace" | "withdraw" | "add";

/** The formats whose remaining rounds can simply be drawn again for a new field. */
const REDRAWABLE = new Set(["americano", "mexicano"]);

/**
 * Why a format cannot take this change, or null when it can.
 *
 * Every message says what to do instead, because "not supported" in the middle
 * of an evening is not an answer anybody can act on.
 */
export function refuseFieldChange(format: string | undefined, change: FieldChange): string | null {
  if (!isRotatingPartners(format)) {
    const name = formatSpec(format ?? "compass").title;
    return `${name} fixes its fixtures when the draw is seeded, so nobody can be added or taken out of it. Retire a match to end one early.`;
  }

  // Replacing never changes the size or shape of the field — one name goes into
  // the slot another came out of — so every format can take it.
  if (change === "replace") return null;

  if (format === "king-court") {
    return "King of the court draws each round from who won on each rung, so there is no spare place to put somebody and no way to leave a rung a player short. Replace somebody instead, or finish the night as it stands.";
  }
  if (format === "winner-court") {
    return "Winner court works out who is on next by replaying the queue from the order people were entered in, so changing that order would rewrite rounds that have already been played. Replace somebody instead.";
  }
  if (!REDRAWABLE.has(format ?? "")) {
    const name = formatSpec(format ?? "americano").title;
    return `${name} splits the field into halves that have to stay the size they were entered as, so it cannot take one more or one fewer. Replace somebody instead.`;
  }
  return null;
}

/** Players still in the draw, in the order the formats read them. */
export async function activeRoster(tx: Tx) {
  return tx.player.findMany({ where: { withdrawnAt: null }, orderBy: { seed: "asc" } });
}

/**
 * The first round nothing has happened in yet — where a change can take hold.
 *
 * A round that is under way cannot be redrawn. Half its matches may be played,
 * and drawing it again would either replay them or give four people a second go
 * at the same round. So the line is drawn after the last round that has been
 * touched at all, whether that means finished or merely started.
 */
async function firstUntouchedRound(tx: Tx): Promise<number> {
  const touched = await tx.match.findFirst({
    where: { bracket: "AM", OR: [{ status: "completed" }, { points: { some: {} } }] },
    orderBy: { round: "desc" },
    select: { round: true },
  });
  return (touched?.round ?? 0) + 1;
}

/**
 * Refuses while the player is still drawn into a round that is under way.
 *
 * Either they are on court with points already scored — in which case taking
 * them out from under it would leave a score attached to a pairing that no
 * longer exists — or they are waiting to play in a round that has partly
 * happened, which cannot be drawn again without replaying it. Both have the
 * same answer, and the app can already do it: retire that match, which ends it
 * and records why.
 */
async function guardRoundInProgress(tx: Tx, playerId: string, from: number): Promise<void> {
  const stuck = await tx.match.findFirst({
    where: {
      bracket: "AM",
      status: { not: "completed" },
      round: { lt: from },
      OR: [
        { player1Id: playerId },
        { player2Id: playerId },
        { player1PartnerId: playerId },
        { player2PartnerId: playerId },
      ],
    },
    select: { round: true },
  });
  if (stuck) {
    throw new Error(
      `That player is still drawn into round ${stuck.round}, which is under way. Finish or retire that match first, then try again.`
    );
  }
}

/** Matches that can still be rewritten: nothing finished, nothing scored on. */
const REWRITABLE: Prisma.MatchWhereInput = {
  bracket: "AM",
  status: { not: "completed" },
  points: { none: {} },
};

/**
 * Somebody takes somebody else's place.
 *
 * The incoming player is a new row rather than a rename, because the outgoing
 * one keeps their record: the matches they played are still theirs, and the
 * standings still say so. They inherit the same seed and the same group, so the
 * formats that read the roster in order see the field exactly as it was with a
 * different name in one slot.
 */
export async function replacePlayer(tx: Tx, outgoingId: string, name: string) {
  const cfg = await tx.tournamentConfig.findUnique({ where: { id: "default" } });
  if (cfg?.status !== "active") throw new Error("No tournament is running.");
  const refusal = refuseFieldChange(cfg.format, "replace");
  if (refusal) throw new Error(refusal);

  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("The player coming in needs a name.");

  const outgoing = await tx.player.findUnique({ where: { id: outgoingId } });
  if (!outgoing) throw new Error("No such player in this draw.");
  if (outgoing.withdrawnAt) throw new Error(`${outgoing.name} has already left this event.`);

  // A replacement can land in any round that has not been touched. Somebody
  // still drawn into a round under way has to be dealt with there first.
  const from = await firstUntouchedRound(tx);
  await guardRoundInProgress(tx, outgoingId, from);

  const [memberId] = await resolveMembers(tx as never, [clean]);
  const incoming = await tx.player.create({
    data: {
      name: clean,
      // The same slot in the field: the derived formats read the roster in seed
      // order, and the stand-in has to land where the person they replaced was.
      seed: outgoing.seed,
      team: outgoing.team,
      pairGroup: outgoing.pairGroup,
      memberId,
    },
  });

  await tx.player.update({
    where: { id: outgoingId },
    data: { withdrawnAt: new Date(), replacedById: incoming.id },
  });

  const matches = await swapInMatches(tx, outgoingId, incoming.id, REWRITABLE);
  await rebalanceCourts(tx);

  return { incomingId: incoming.id, name: clean, replaced: outgoing.name, matches };
}

/**
 * Somebody leaves and nobody takes their place.
 *
 * Their record stands. Every round not yet drawn is drawn again for the field
 * that is left.
 */
export async function withdrawPlayer(tx: Tx, playerId: string) {
  const cfg = await tx.tournamentConfig.findUnique({ where: { id: "default" } });
  if (cfg?.status !== "active") throw new Error("No tournament is running.");
  const refusal = refuseFieldChange(cfg.format, "withdraw");
  if (refusal) throw new Error(refusal);

  const player = await tx.player.findUnique({ where: { id: playerId } });
  if (!player) throw new Error("No such player in this draw.");
  if (player.withdrawnAt) throw new Error(`${player.name} has already left this event.`);

  const remaining = (await activeRoster(tx)).length - 1;
  const invalid = formatSpec(cfg.format).validateField?.(remaining);
  if (invalid) throw new Error(`Cannot take ${player.name} out. ${invalid}`);

  const from = await firstUntouchedRound(tx);
  await guardRoundInProgress(tx, playerId, from);
  await tx.player.update({ where: { id: playerId }, data: { withdrawnAt: new Date() } });

  const redrawn = await redrawUnplayedRounds(tx, cfg.format, cfg.amRounds, from);
  // A redraw deletes the round that was open and, for a derived format, the
  // round it had already worked out. Something has to put one back, or the
  // change leaves a draw with nothing on court — so the next round is opened
  // here rather than waiting for a point to be scored that nobody can score.
  await openNextRotatingRound(tx);
  await rebalanceCourts(tx);
  return { name: player.name, remaining, redrawn };
}

/** Somebody arrives late and joins from the next round. */
export async function addPlayer(tx: Tx, name: string) {
  const cfg = await tx.tournamentConfig.findUnique({ where: { id: "default" } });
  if (cfg?.status !== "active") throw new Error("No tournament is running.");
  const refusal = refuseFieldChange(cfg.format, "add");
  if (refusal) throw new Error(refusal);

  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("The player joining needs a name.");

  const roster = await activeRoster(tx);
  const invalid = formatSpec(cfg.format).validateField?.(roster.length + 1);
  if (invalid) throw new Error(`Cannot bring ${clean} in. ${invalid}`);

  const [memberId] = await resolveMembers(tx as never, [clean]);
  const last = await tx.player.aggregate({ _max: { seed: true } });
  const player = await tx.player.create({
    data: { name: clean, seed: (last._max.seed ?? -1) + 1, memberId },
  });

  const redrawn = await redrawUnplayedRounds(tx, cfg.format, cfg.amRounds, await firstUntouchedRound(tx));
  // A redraw deletes the round that was open and, for a derived format, the
  // round it had already worked out. Something has to put one back, or the
  // change leaves a draw with nothing on court — so the next round is opened
  // here rather than waiting for a point to be scored that nobody can score.
  await openNextRotatingRound(tx);
  await rebalanceCourts(tx);
  return { id: player.id, name: clean, playing: roster.length + 1, redrawn };
}

/**
 * Draws every round after the one on court again, for the field as it now is.
 *
 * The derived formats need nothing here — they work the next round out from the
 * roster when the current one finishes, so a changed roster is all it takes.
 * The pre-drawn ones hold their whole rotation as `pending` rows, which now
 * describe a field that no longer exists.
 *
 * One property is genuinely lost: an americano's rotation partners everyone
 * with everyone exactly once, and that can only hold across a single draw. The
 * rounds after a change are a fresh rotation over the new field, so a pairing
 * from before it may come round again. That is worth saying out loud, and the
 * control screen does.
 */
async function redrawUnplayedRounds(tx: Tx, format: string, amRounds: number, from: number): Promise<number> {
  // Everything from the first untouched round goes. Nothing played, nothing
  // started, and nothing in a round that is half-done is affected.
  await tx.match.deleteMany({ where: { bracket: "AM", round: { gte: from } } });
  if (isDerivedRounds(format)) return 0;

  const remaining = amRounds - from + 1;
  if (remaining <= 0) return 0;

  const roster = await activeRoster(tx);
  if (roster.length < 4) return 0;

  const fresh = generateAmericano(roster.length, remaining).matches;
  for (const m of fresh) {
    await tx.match.create({
      data: {
        bracket: "AM",
        round: from + m.round - 1,
        posIndex: m.posIndex,
        player1Id: roster[m.team1[0]].id,
        player1PartnerId: roster[m.team1[1]].id,
        player2Id: roster[m.team2[0]].id,
        player2PartnerId: roster[m.team2[1]].id,
        status: "pending",
        readyAt: null,
      },
    });
  }
  return fresh.length;
}

