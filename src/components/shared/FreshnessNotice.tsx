"use client";

import { useEffect, useState } from "react";
import { freshnessOf } from "@/lib/staleness";

/**
 * Says so, on the screen itself, when that screen has stopped hearing from the
 * server.
 *
 * Sized for the worst case, which is a television on a court wall: someone
 * standing ten metres away reads the score off it and takes it as fact. A
 * momentary gap gets a small pill in the corner, because that is all it
 * deserves. A screen that has genuinely fallen off gets a band across the
 * bottom, because at that point the number above it is probably wrong and the
 * only honest thing to do is say so where nobody can miss it.
 *
 * Neither covers the score: the last thing received is still the best guess
 * available, and the job here is to qualify it, not to hide it. The pill sits
 * in the corner the scoreboard keeps for its watermark rather than the one
 * holding the "up next" strip, and `pointer-events` are off throughout, so a
 * coach scoring on a phone can never have a tap swallowed by a warning.
 */
export default function FreshnessNotice({ lastSyncAt }: { lastSyncAt: number | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { level, ago } = freshnessOf(lastSyncAt, now);
  if (level === "live") return null;

  if (level === "stale") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex items-center gap-2.5 rounded-full border border-south/40 bg-court-panel/95 px-4 py-2 shadow-lg backdrop-blur-sm"
      >
        <span className="h-2 w-2 shrink-0 animate-pulse-glow rounded-full bg-south" />
        <span className="font-display text-xs uppercase tracking-[0.18em] text-south sm:text-sm">
          Reconnecting
        </span>
        <span className="text-xs text-white/45 sm:text-sm">last update {ago}</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 border-t-2 border-live bg-[#1c0608] px-5 py-3 shadow-[0_-24px_48px_rgba(0,0,0,0.75)] sm:px-8 sm:py-4"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 text-center sm:flex-row sm:justify-center sm:gap-4 sm:text-left">
        <span className="flex items-center gap-2.5 font-display text-sm uppercase tracking-[0.18em] text-live sm:text-lg lg:text-xl">
          <span className="h-2.5 w-2.5 shrink-0 animate-pulse-glow rounded-full bg-live" />
          This screen is not updating
        </span>
        <span className="text-xs text-white/70 sm:text-base lg:text-lg">
          Last update {ago} — the score shown may be out of date.
        </span>
      </div>
    </div>
  );
}
