/**
 * Putting a stand-in where the player they replaced would have been.
 *
 * Its own module because both sides of the change need it and they must not
 * import each other: `field.ts` swaps names into rounds that already exist, and
 * `rotatingRounds.ts` swaps them into rounds it has just derived.
 *
 * The derivation is why this exists at all. King of the court builds its next
 * ladder from who won on each rung, and winner court replays its queue from the
 * order people were entered in — so both name the player who actually played,
 * who after a replacement has gone home. Rebuilding those derivations around
 * the stand-in would mean rewriting what happened; swapping the name in
 * afterwards leaves the ladder and the queue exactly as the night earned them.
 */
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Swaps one player id for another everywhere it appears in a set of matches. */
export async function swapInMatches(
  tx: Tx,
  from: string,
  to: string,
  where: Prisma.MatchWhereInput
): Promise<number> {
  let changed = 0;
  for (const field of ["player1Id", "player2Id", "player1PartnerId", "player2PartnerId"] as const) {
    const res = await tx.match.updateMany({ where: { ...where, [field]: from }, data: { [field]: to } });
    changed += res.count;
  }
  return changed;
}

export async function applyStandIns(tx: Tx, matchIds: string[]): Promise<void> {
  if (matchIds.length === 0) return;

  const replaced = await tx.player.findMany({
    where: { replacedById: { not: null } },
    select: { id: true, replacedById: true },
  });
  if (replaced.length === 0) return;

  const next = new Map(replaced.map((p) => [p.id, p.replacedById!]));
  for (const [from] of next) {
    // Follow the chain — a stand-in can be replaced in turn — and stop if it
    // ever loops rather than spinning on a cycle that should not exist.
    let to = next.get(from)!;
    const seen = new Set([from]);
    while (next.has(to) && !seen.has(to)) {
      seen.add(to);
      to = next.get(to)!;
    }
    await swapInMatches(tx, from, to, { id: { in: matchIds } });
  }
}
