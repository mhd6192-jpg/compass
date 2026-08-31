/**
 * How long ago a screen last heard from the server, and whether that is worth
 * saying out loud.
 *
 * Every screen polls for state and paints whatever it last received. When the
 * polling stops working — the venue wifi drops, a phone's hotspot dies, the
 * laptop driving a TV wanders off the network — nothing about the picture
 * changes. The score sits there looking exactly as authoritative as it did a
 * second earlier, and people read it off the wall and believe it. A scoreboard
 * that is quietly wrong is worse than one that is obviously broken, and that is
 * the failure this describes.
 *
 * It is built on the time of the last successful poll rather than on a
 * connected/disconnected flag, for two reasons. A flag has to be flipped by
 * something, and a fetch that hangs instead of failing never flips it: the
 * screen stays "connected" and silent indefinitely. And a timestamp can say
 * *how* stale, which is the whole difference between a blink and a screen
 * nobody should be trusting.
 */

/**
 * Polls go out every 800ms, so this is roughly ten missed ones. Past what a
 * hiccup explains, and still soon enough that a point scored in the meantime
 * has probably not been read off the wall by anybody yet.
 */
export const STALE_AFTER_MS = 8_000;

/**
 * By here the picture is not late, it is wrong. Points come every twenty or
 * thirty seconds, so three quarters of a minute of silence means the score on
 * screen has most likely already been overtaken — at which point the notice
 * stops being a footnote and starts being the important thing on the screen.
 */
export const LOST_AFTER_MS = 45_000;

export type FreshnessLevel = "live" | "stale" | "lost";

export interface Freshness {
  level: FreshnessLevel;
  /** Milliseconds since the last successful poll. Zero while live. */
  agoMs: number;
  /** "14 seconds ago", "3 minutes ago". Empty while live. */
  ago: string;
}

const LIVE: Freshness = { level: "live", agoMs: 0, ago: "" };

/**
 * @param lastSyncAt when the last successful poll landed, or null if none has.
 * @param now the client's clock, or null before the browser has taken over.
 */
export function freshnessOf(lastSyncAt: number | null, now: number | null): Freshness {
  // Nothing received yet is not staleness — it is the connecting state, which
  // the gate already has a screen for. And `now` is null until the client has
  // mounted, because the server has no business guessing the browser's clock.
  if (lastSyncAt === null || now === null) return LIVE;

  // A clock that has jumped backwards (a device syncing time, a laptop waking)
  // must not be reported as a negative age, or as freshness we do not have.
  const agoMs = Math.max(0, now - lastSyncAt);
  if (agoMs < STALE_AFTER_MS) return LIVE;

  return {
    level: agoMs >= LOST_AFTER_MS ? "lost" : "stale",
    agoMs,
    ago: agoLabel(agoMs),
  };
}

/**
 * Rounds rather than truncates, so the number never claims a screen is fresher
 * than it is — the safe direction for this particular sentence.
 */
export function agoLabel(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs} second${secs === 1 ? "" : "s"} ago`;

  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;

  const hours = Math.round(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
