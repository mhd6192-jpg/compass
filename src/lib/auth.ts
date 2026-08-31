import { prisma } from "./db";

/**
 * The PIN a coach uses while an event is running.
 *
 * Read from the tournament, so it dies with it — which is correct for scoring
 * a match, and useless for creating one. See `verifyOrganiser` for that.
 */
export async function verifyPin(pin: unknown): Promise<boolean> {
  if (typeof pin !== "string" || !pin) return false;
  const cfg = await prisma.tournamentConfig.findUnique({ where: { id: "default" } });
  return !!cfg && cfg.pin === pin;
}

/**
 * The PIN for the things that outlive a tournament: seeding a new one, saving
 * and deleting entrant lists, deleting a past event.
 *
 * Those endpoints were open, and not by choice — `verifyPin` reads from the
 * TournamentConfig row that a reset deletes, so at the moment someone seeds a
 * draw there is nothing to check. The organiser PIN is kept separately and
 * never deleted, which is what closes them.
 *
 * Three ways in, in order:
 *
 *   1. `ORGANISER_PIN` in the environment always works. It is the recovery
 *      path — an organiser who forgets the PIN can set this on the host rather
 *      than being locked out of their own app.
 *   2. Otherwise the stored PIN, once the installation has been claimed.
 *   3. If it has never been claimed, anything is accepted. An install updating
 *      to this version has no stored PIN, and refusing everyone until somebody
 *      guesses one would be worse than the hole being closed.
 */
export async function verifyOrganiser(pin: unknown): Promise<boolean> {
  const master = process.env.ORGANISER_PIN;
  if (master && typeof pin === "string" && pin === master) return true;

  const stored = await organiserPin();
  if (stored === null) return true; // unclaimed
  return typeof pin === "string" && pin === stored;
}

/** The stored organiser PIN, or null when the installation is unclaimed. */
export async function organiserPin(): Promise<string | null> {
  try {
    const row = await prisma.appSettings.findUnique({ where: { id: "default" } });
    return row?.organiserPin ?? null;
  } catch {
    // Before `prisma db push` has run there is no table, which reads as
    // unclaimed — the same as a fresh install.
    return null;
  }
}

/**
 * Claims the installation with this PIN, if nobody has.
 *
 * Called when a tournament is seeded, so the first event an organiser sets up
 * quietly becomes the thing that locks the door behind them. Never overwrites
 * an existing PIN: changing it is a deliberate act, not a side effect of
 * starting an event.
 */
export async function claimOrganiser(pin: string): Promise<void> {
  if (!pin) return;
  try {
    const existing = await organiserPin();
    if (existing !== null) return;
    await prisma.appSettings.upsert({
      where: { id: "default" },
      create: { id: "default", organiserPin: pin },
      update: { organiserPin: pin },
    });
  } catch {
    // A missing table must not stop someone starting their event.
  }
}
