"use client";

/**
 * Points that have been tapped but not yet accepted by the server.
 *
 * Venue wifi drops. A hotspot wanders behind a pillar. When that happens a
 * coach must be able to keep scoring — the match does not pause for the
 * network — so taps go into this queue first and are drained in order once the
 * connection is back.
 *
 * Two things make it safe rather than merely convenient:
 *
 *  - It is written to localStorage on every change, so the queue survives a
 *    reload, a locked phone, or the browser evicting the tab. Points a coach
 *    already tapped are the one thing that must never be lost.
 *  - Every entry carries the sequence number it expects to occupy, so replaying
 *    an entry whose reply was lost is recognised by the server and ignored
 *    instead of scoring twice.
 */

const KEY = "compass-v2-outbox";

/**
 * A request that never answers must not wedge the queue.
 *
 * Wifi that has gone bad does not always refuse a connection — it frequently
 * accepts one and then says nothing at all. Without a deadline that `await`
 * hangs forever, the drain never releases its guard, and every later attempt
 * returns early: the queue silently stops draining for the rest of the day,
 * which is precisely the failure it exists to prevent.
 */
const REQUEST_TIMEOUT_MS = 10_000;

export interface QueuedPoint {
  /** Local id, so the UI can key on it before the server knows anything. */
  id: string;
  matchId: string;
  slot: 1 | 2;
  /** 1-based position this point expects in the match's point list. */
  expectedSeq: number;
  queuedAt: number;
}

export type OutboxStatus = "idle" | "sending" | "offline" | "error";

type Listener = () => void;

let queue: QueuedPoint[] = [];
let status: OutboxStatus = "idle";
let lastError: string | null = null;
let loaded = false;
let draining = false;
const listeners = new Set<Listener>();

/**
 * A stable object for `useSyncExternalStore`.
 *
 * It compares snapshots by identity, so handing back a freshly built object on
 * every read makes React think the store changed on every render and loop for
 * ever. The reference is rebuilt only when something actually changes.
 */
let cached: { queue: QueuedPoint[]; status: OutboxStatus; error: string | null } = {
  queue: [],
  status: "idle",
  error: null,
};

function emit() {
  cached = { queue, status, error: lastError };
  for (const l of listeners) l();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // A full or disabled store must not take the scoring path down; the queue
    // still works in memory for this session.
  }
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) queue = parsed.filter((p) => p && p.matchId && (p.slot === 1 || p.slot === 2));
    }
  } catch {
    queue = [];
  }
  cached = { queue, status, error: lastError };
}

export function subscribe(fn: Listener): () => void {
  load();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSnapshot() {
  load();
  return cached;
}

/** How many taps for this match are still waiting to reach the server. */
export function pendingFor(matchId: string): number {
  load();
  return queue.filter((p) => p.matchId === matchId).length;
}

/**
 * Queue a tap.
 *
 * `serverPoints` is the point count from the last server snapshot; the entry's
 * sequence is that plus whatever is already queued ahead of it for the same
 * match, which is exactly the slot it will occupy once the queue drains.
 */
export function enqueue(matchId: string, slot: 1 | 2, serverPoints: number): QueuedPoint {
  load();
  const ahead = queue.filter((p) => p.matchId === matchId).length;
  const entry: QueuedPoint = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    matchId,
    slot,
    expectedSeq: serverPoints + ahead + 1,
    queuedAt: Date.now(),
  };
  queue = [...queue, entry];
  persist();
  emit();
  return entry;
}

/** The taps for this match still waiting to be sent, oldest first. */
export function queuedFor(matchId: string): QueuedPoint[] {
  load();
  return queue.filter((p) => p.matchId === matchId);
}

/**
 * Take back the most recently queued tap for a match.
 *
 * This is what undo does while the phone is offline. The point never reached
 * the server, so there is nothing to undo *there* — sending an undo would
 * delete a different, older point that was genuinely scored. Returns false when
 * nothing is queued, meaning the undo does have to go to the server.
 */
export function popLast(matchId: string): boolean {
  load();
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].matchId === matchId) {
      queue = [...queue.slice(0, i), ...queue.slice(i + 1)];
      persist();
      emit();
      return true;
    }
  }
  return false;
}

/** Drop everything queued for a match — used when the server says we are out of sync. */
export function clearMatch(matchId: string) {
  load();
  queue = queue.filter((p) => p.matchId !== matchId);
  persist();
  emit();
}

export function clearAll() {
  load();
  queue = [];
  lastError = null;
  status = "idle";
  persist();
  emit();
}

function setStatus(next: OutboxStatus, error: string | null = null) {
  if (status === next && lastError === error) return;
  status = next;
  lastError = error;
  emit();
}

export interface DrainHandlers {
  pin: string;
  /** Told when a match's queue had to be abandoned, so the UI can resync and explain. */
  onDesync: (matchId: string, message: string) => void;
  onUnauthorized: () => void;
  /** Called after any entry is accepted, so the caller can refresh the snapshot. */
  onAccepted: () => void;
}

/**
 * Send whatever is queued, oldest first, one at a time.
 *
 * Strictly serial: point 7 must not reach the server before point 6, or the
 * sequence check rejects it. Stops at the first network failure and leaves the
 * rest queued for the next attempt.
 */
export async function drain(handlers: DrainHandlers): Promise<void> {
  load();
  if (draining) return;
  if (queue.length === 0) {
    setStatus("idle");
    return;
  }

  draining = true;
  try {
    while (queue.length > 0) {
      const entry = queue[0];
      setStatus("sending");

      let res: Response;
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        res = await fetch(`/api/matches/${entry.matchId}/point`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            slot: entry.slot,
            pin: handlers.pin,
            expectedSeq: entry.expectedSeq,
            // The tap, not the send: a queued outage posts in one burst.
            tappedAt: entry.queuedAt,
          }),
        });
      } catch {
        // No connection, or no answer within the deadline. Keep everything and
        // try again on the next tick.
        setStatus("offline");
        return;
      } finally {
        clearTimeout(deadline);
      }

      if (res.status === 401) {
        setStatus("error", "PIN rejected — points are saved and will send once it is fixed.");
        handlers.onUnauthorized();
        return;
      }

      if (res.status === 429) {
        // Rate limited, which is temporary — the caller has simply tried too
        // many wrong PINs, or shares an address with someone who has. The
        // points below MUST survive it. Falling through to the branch under
        // this one would treat a passing lockout as an unrecoverable rejection
        // and delete a coach's saved points mid-match, which is the one thing
        // this queue exists to prevent. Keep everything and try again on the
        // next tick, exactly as for a dropped connection.
        let message = "Too many PIN attempts — points are saved and will send shortly.";
        try {
          message = (await res.json())?.error ?? message;
        } catch {
          /* keep the default */
        }
        setStatus("offline", message);
        return;
      }

      if (!res.ok) {
        let message = "The server rejected a point.";
        try {
          message = (await res.json())?.error ?? message;
        } catch {
          /* keep the default */
        }
        // Out of sync, match already finished, and anything else the server
        // refuses are all unrecoverable by retrying — replaying would either
        // fail forever or write a wrong score. Drop this match's queue and let
        // the caller resync from the server, which is the true record.
        const matchId = entry.matchId;
        clearMatch(matchId);
        setStatus("error", message);
        handlers.onDesync(matchId, message);
        continue;
      }

      // Accepted, or recognised as a replay — either way it is now recorded.
      queue = queue.filter((p) => p.id !== entry.id);
      persist();
      emit();
      handlers.onAccepted();
    }
    setStatus("idle");
  } finally {
    draining = false;
  }
}
