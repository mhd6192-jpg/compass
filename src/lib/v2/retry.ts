"use client";

/**
 * Posting a command that has to happen *now*, over wifi that might not be there.
 *
 * This is the counterpart to the point outbox, and the distinction matters. A
 * point is a fact that already happened, so it is queued to localStorage and
 * replayed whenever the network comes back, however much later. A command —
 * advance the ceremony, change the match on a court — is an instruction about
 * the present moment. Replaying one from a durable queue means it fires at a
 * time nobody chose, possibly contradicting whatever the coach or organiser did
 * after giving up on it.
 *
 * So commands retry for about as long as someone is plausibly still standing
 * there waiting, then stop and say plainly that nothing changed.
 */

export type PostOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "rejected"; status: number; error: string }
  | { kind: "offline" };

const ATTEMPTS = 4;
const DELAY_MS = 1800;
/** Same hazard as the point queue: bad wifi answers by saying nothing at all. */
const REQUEST_TIMEOUT_MS = 8_000;

export async function postWithRetry<T>(
  url: string,
  body: unknown,
  onRetry?: () => void
): Promise<PostOutcome<T>> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        /* an empty or malformed body is handled by the status check below */
      }

      if (!res.ok) {
        const error = (data as { error?: string } | null)?.error ?? "The server rejected it.";
        return { kind: "rejected", status: res.status, error };
      }
      return { kind: "ok", data: data as T };
    } catch {
      // Network-level failure only — a rejection from the server is an answer,
      // and repeating it would not change the reply.
      if (attempt === ATTEMPTS - 1) break;
      onRetry?.();
      await new Promise((r) => setTimeout(r, DELAY_MS));
    } finally {
      clearTimeout(deadline);
    }
  }
  return { kind: "offline" };
}
