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

/**
 * The highest sequence the server has actually confirmed, per match.
 *
 * A tap's sequence used to be counted from the last snapshot that had landed
 * plus whatever was still queued. An entry leaves the queue the instant the
 * server accepts it, but the snapshot only catches up a full round trip later —
 * so for the length of that round trip the sum understated the true position by
 * however many points had just been accepted. A tap made in that window got too
 * low a sequence, the server read it as a replay of a point it already had,
 * answered 200 with `duplicate: true`, and the queue filed it under "recorded"
 * and deleted it. The point never existed and nothing said so.
 *
 * So the queue remembers what it has had confirmed rather than re-deriving it
 * from something that lags. Deliberately not persisted: after a reload the
 * queue is restored with the sequences it already carried, and the server's own
 * count is the right base for anything new.
 */
const confirmedSeq = new Map<string, number>();

/**
 * A PIN the server has already refused.
 *
 * On a 401 the queue is kept — the points are good, the PIN is not — but the
 * retry timer went on posting the same rejected PIN every 2.5 seconds, about 24
 * failed attempts a minute. Failures are counted per address and a whole club
 * sits behind one, so a single phone with the wrong PIN locked every coach in
 * the venue out of scoring within half a minute. It waits for a different PIN
 * now, which costs exactly one attempt.
 */
let refusedPin: string | null = null;
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
  const base = Math.max(serverPoints, confirmedSeq.get(matchId) ?? 0);
  const entry: QueuedPoint = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    matchId,
    slot,
    expectedSeq: base + ahead + 1,
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
/**
 * Forget what the server had confirmed for this match.
 *
 * A snapshot that has not caught up and a point the server has just removed
 * look identical from in here — both are "the server reports fewer points than
 * we have had confirmed". Guessing between them either loses a tap or refuses
 * every tap after an undo, so the undo says so instead: it is the one moment
 * the client knows the count went down.
 */
export function forgetConfirmed(matchId: string) {
  confirmedSeq.delete(matchId);
}

export function clearMatch(matchId: string) {
  load();
  confirmedSeq.delete(matchId);
  queue = queue.filter((p) => p.matchId !== matchId);
  persist();
  emit();
}

export function clearAll() {
  load();
  confirmedSeq.clear();
  refusedPin = null;
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
  // The retry timer calls this every couple of seconds regardless. Posting a PIN
  // the server has already refused just banks another failure against a bucket
  // the whole club shares, so wait for a different one. The points keep.
  if (refusedPin !== null && handlers.pin === refusedPin) return;

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
        // Remember which PIN it was. The retry timer keeps calling this, and
        // posting the same refused PIN twice a second banks failures against a
        // bucket the whole club shares.
        refusedPin = handlers.pin;
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
        let message = res.status >= 500 ? "The server is having trouble." : "The server rejected a point.";
        try {
          message = (await res.json())?.error ?? message;
        } catch {
          /* keep the default */
        }

        // A fault the server SUFFERED is not a refusal it made. A database blip,
        // a transaction timeout, a platform 502 — all of them used to land in
        // the branch below and delete a coach's whole backlog for that match,
        // which is the one thing this queue exists to prevent. Keep everything
        // and try again on the next tick, exactly as for a dropped connection.
        if (res.status >= 500) {
          setStatus("offline", message);
          return;
        }

        // What is left is a decision: out of step, or the match is already over.
        // Replaying either would fail forever or write a wrong score, so drop
        // this match's queue and let the caller resync from the server, which is
        // the true record.
        const matchId = entry.matchId;
        clearMatch(matchId);
        setStatus("error", message);
        handlers.onDesync(matchId, message);
        continue;
      }

      // Accepted, or recognised as a replay — either way it is now recorded.
      // Remembering the sequence is what stops the next tap being numbered off a
      // snapshot that has not caught up yet and thrown away as a replay.
      confirmedSeq.set(entry.matchId, Math.max(confirmedSeq.get(entry.matchId) ?? 0, entry.expectedSeq));
      refusedPin = null;
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
