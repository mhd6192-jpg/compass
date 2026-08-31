import { prisma } from "./db";
import { verifyOrganiser, verifyPin } from "./auth";

/**
 * Slowing down PIN guessing.
 *
 * The organiser PIN is ten digits, which is not worth guessing. The coach PIN
 * is whatever the organiser typed — often four digits, which is ten thousand
 * combinations and perfectly guessable in an afternoon. That is the hole this
 * closes.
 *
 * The shape of the limits is set by who actually gets caught in them. A whole
 * club sits behind one public address, so every coach shares a bucket: a limit
 * tight enough to be dramatic would lock the room out mid-match over a couple
 * of typos. So the allowance is generous and the first lock is a minute — long
 * enough to be useless to a script, short enough that a coach who mistyped
 * barely notices. Repeated locks double, which is what makes a four-digit PIN
 * impractical to grind through.
 *
 * Two things keep honest users out of trouble:
 *
 *   - A correct PIN clears the record. Somebody who fumbles it five times and
 *     then gets it right starts clean, and the offline outbox retrying queued
 *     points with a stale PIN cannot bank failures that bite later.
 *   - Coach and organiser attempts are counted separately, so failing one can
 *     never lock the other.
 *
 * If the table is missing or the database is unhappy this lets the attempt
 * through. Losing the limiter is bad; refusing to score a live match because a
 * counter could not be written is worse.
 */

/** Failures allowed inside the window before the key is locked. */
const MAX_FAILS = 10;
/** Failures older than this stop counting. */
const WINDOW_MS = 5 * 60 * 1000;
/** The first lock. Each consecutive lock doubles it, up to the cap. */
const BASE_LOCK_MS = 60 * 1000;
const MAX_LOCK_MS = 15 * 60 * 1000;
/** A quiet spell this long forgives the escalation entirely. */
const FORGIVE_MS = 60 * 60 * 1000;

export type PinScope = "coach" | "organiser";

export type PinCheck =
  | { ok: true }
  | { ok: false; status: 401 | 429; error: string; retryAfter?: number };

/**
 * Who is asking.
 *
 * Behind Vercel the client address arrives in `x-forwarded-for`; the first
 * entry is the caller, the rest are proxies. With no header at all — a local
 * run, or a stray request — everything shares one bucket, which is safe in the
 * direction that matters: it limits more, not less.
 */
function callerKey(req: Request, scope: PinScope): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
  return `${ip}:${scope}`;
}

function lockFor(lockCount: number): number {
  return Math.min(BASE_LOCK_MS * Math.pow(2, Math.max(0, lockCount - 1)), MAX_LOCK_MS);
}

function seconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Verifies a PIN, refusing outright while the caller is locked out.
 *
 * The lock is checked BEFORE the PIN is looked at. Checking afterwards would
 * record the failure but still let every guess be tested, which is no limit at
 * all — the point is that a locked caller learns nothing about whether their
 * guess was right.
 */
export async function checkPin(req: Request, scope: PinScope, pin: unknown): Promise<PinCheck> {
  const key = callerKey(req, scope);
  const now = new Date();

  let row: { fails: number; windowStart: Date; lockedUntil: Date | null; lockCount: number } | null = null;
  try {
    row = await prisma.pinAttempt.findUnique({ where: { key } });
  } catch {
    // No table, or the database is unwell: verify without the limiter rather
    // than locking a live event out of its own scoring.
    return (await verify(scope, pin)) ? { ok: true } : { ok: false, status: 401, error: wrongPin(scope) };
  }

  if (row?.lockedUntil && row.lockedUntil > now) {
    const wait = seconds(row.lockedUntil.getTime() - now.getTime());
    return {
      ok: false,
      status: 429,
      retryAfter: wait,
      error: `Too many incorrect PINs. Try again in ${wait} second${wait === 1 ? "" : "s"}.`,
    };
  }

  if (await verify(scope, pin)) {
    // Right PIN: forget everything, so a run of typos costs nothing later.
    if (row) await prisma.pinAttempt.delete({ where: { key } }).catch(() => {});
    return { ok: true };
  }

  await recordFailure(key, row, now);
  return { ok: false, status: 401, error: wrongPin(scope) };
}

async function verify(scope: PinScope, pin: unknown): Promise<boolean> {
  return scope === "organiser" ? verifyOrganiser(pin) : verifyPin(pin);
}

function wrongPin(scope: PinScope): string {
  return scope === "organiser" ? "That organiser PIN is not right for this app." : "Invalid PIN";
}

async function recordFailure(
  key: string,
  row: { fails: number; windowStart: Date; lockedUntil: Date | null; lockCount: number } | null,
  now: Date
): Promise<void> {
  try {
    // A lock that has expired, or a long quiet spell, starts the count again —
    // so each lock costs a fresh run of failures rather than one stray guess.
    const staleWindow = !row || now.getTime() - row.windowStart.getTime() > WINDOW_MS;
    const forgiven = !!row && now.getTime() - row.windowStart.getTime() > FORGIVE_MS;
    const fails = staleWindow ? 1 : row!.fails + 1;
    const windowStart = staleWindow ? now : row!.windowStart;
    const lockCount = forgiven ? 0 : row?.lockCount ?? 0;

    if (fails >= MAX_FAILS) {
      const nextLockCount = lockCount + 1;
      const until = new Date(now.getTime() + lockFor(nextLockCount));
      await prisma.pinAttempt.upsert({
        where: { key },
        create: { key, fails: 0, windowStart: now, lockedUntil: until, lockCount: nextLockCount },
        update: { fails: 0, windowStart: now, lockedUntil: until, lockCount: nextLockCount },
      });
      return;
    }

    await prisma.pinAttempt.upsert({
      where: { key },
      create: { key, fails, windowStart, lockedUntil: null, lockCount },
      update: { fails, windowStart, lockedUntil: null, lockCount },
    });
  } catch {
    // Recording is best effort; never fail a request because of it.
  }
}

/** Exposed for the checks, so the limits are asserted rather than assumed. */
export const RATE_LIMIT = { MAX_FAILS, WINDOW_MS, BASE_LOCK_MS, MAX_LOCK_MS, FORGIVE_MS, lockFor };
