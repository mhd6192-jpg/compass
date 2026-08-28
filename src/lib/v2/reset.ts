/**
 * Clearing the v2 screen state, kept in its own module so the seeding path can
 * import it without pulling in the snapshot/podium machinery.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

/** True when the failure is just "the v2 tables aren't in this database yet". */
export function isMissingTable(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  if (code === "P2021" || code === "P2022") return true;
  const msg = e instanceof Error ? e.message : "";
  return /does not exist in the current database|relation .* does not exist/i.test(msg);
}

/**
 * Wipes the court stages and the ceremony. Must run whenever a tournament is
 * seeded or reset.
 *
 * Without this, seeding a new event leaves the previous one's Ceremony row
 * behind — and because a running ceremony outranks every other screen, the
 * court TVs come up showing the last event's runner-up instead of tonight's
 * first match. The court stages go too: their activeMatchId points at matches
 * that no longer exist.
 *
 * A database without the v2 tables is left alone, so v1 setup and reset keep
 * working on a deployment that has never run `prisma db push` for v2.
 */
export async function resetV2State(tx: Prisma.TransactionClient | PrismaClient): Promise<void> {
  try {
    await tx.courtStage.deleteMany({});
    await tx.ceremony.deleteMany({});
  } catch (e) {
    if (!isMissingTable(e)) throw e;
  }
}
