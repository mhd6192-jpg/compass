"use client";

import { useEffect } from "react";

/**
 * Keeps a display awake for as long as it is on screen.
 *
 * A court television exists to be looked at from ten metres away, and the one
 * thing every screen does on its own is go to sleep. A screensaver arriving
 * mid-match is the same failure as a frozen scoreboard, except somebody has to
 * find a remote to fix it.
 *
 * Three things about the API shape this more than the API itself:
 *
 *   It only works on a visible page. A request from a hidden tab is refused
 *   outright, so there is no point asking until the page is on screen.
 *
 *   The browser takes the lock back whenever the page is hidden, and may take
 *   it back for reasons of its own — battery saver, an OS policy. That is the
 *   normal course of events rather than an error, so the lock is asked for
 *   again instead of being assumed to still be held.
 *
 *   It does not exist on older browsers, which is exactly the browser a
 *   wall-mounted television is likely to have. Every failure here is swallowed:
 *   a screen that sleeps is worse than one that does not, but a screen that
 *   fails to render is worse than both.
 */

/** A browser that hands the lock straight back must not be asked in a hot loop. */
const RETRY_GAP_MS = 2000;

export function useWakeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    // Typed as always present, but absent on the browsers this exists for.
    const wakeLock = navigator.wakeLock as Navigator["wakeLock"] | undefined;
    if (!wakeLock?.request) return;

    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    let lastAsk = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible") return;

      // Too soon after the last attempt. Wait out the gap rather than dropping
      // the attempt: a browser that hands the lock straight back must not put
      // us in a hot loop, but it must not leave the screen unlocked until the
      // next visibility change either.
      const now = Date.now();
      if (now - lastAsk < RETRY_GAP_MS) {
        if (retry === null) {
          retry = setTimeout(() => {
            retry = null;
            void acquire();
          }, RETRY_GAP_MS - (now - lastAsk));
        }
        return;
      }
      lastAsk = now;
      try {
        const held = await wakeLock.request("screen");
        if (stopped) {
          void held.release().catch(() => {});
          return;
        }
        sentinel = held;
        held.addEventListener("release", () => {
          sentinel = null;
          void acquire();
        });
      } catch {
        // Refused — an older browser, battery saver, or a page nobody has
        // touched yet. The screen still shows the score either way.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      if (retry !== null) clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
