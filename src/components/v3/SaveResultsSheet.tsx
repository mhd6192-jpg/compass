"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Saving the night's results without wiping the draw.
 *
 * Resetting has always written the event to the history first, which covers the
 * end of the evening. It does not cover the twenty minutes before it, when
 * somebody wants to send the standings to the group chat while the last match
 * is still on — and the only way to do that was to end the tournament.
 *
 * Saving twice is the ordinary case rather than a mistake: save before the last
 * match, then reset at the end. Both writes describe the same night, so the
 * second updates the first instead of leaving a half-played duplicate sitting
 * in the history beside the finished one.
 */
export default function SaveResultsSheet() {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [label, setLabel] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, label: label.trim() || undefined }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) setError(out.error ?? "Could not save.");
      else setSaved(out.id);
    } catch {
      setError("No connection — nothing has been saved. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-court-line bg-court-panel p-4">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 text-left">
        <h2 className="font-display uppercase text-sm text-white/60">Tonight&apos;s results</h2>
        <span className="text-white/30 text-xs font-display uppercase">{open ? "Hide" : "Send them out now?"}</span>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-white/40 text-xs">
            Saves the standings as they stand to Past events, where they can be copied or printed. The draw is not
            touched — play carries on. Saving again later updates the same entry rather than adding a second one, so
            the reset at the end of the night will not duplicate it.
          </p>

          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Organiser PIN"
            className="w-full rounded-xl border border-court-line bg-court-bg px-3 py-2 text-sm"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name it (optional) — e.g. Tuesday night"
            className="w-full rounded-xl border border-court-line bg-court-bg px-3 py-2 text-sm"
          />

          <button
            onClick={save}
            disabled={busy || !pin}
            className="rounded-xl bg-gold text-court-bg font-display uppercase text-sm py-2.5 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save to past events"}
          </button>

          {saved && (
            <Link
              href={`/history/${saved}`}
              className="rounded-xl border border-gold/50 bg-gold/10 px-3 py-2.5 text-center text-sm text-gold"
            >
              Saved — open it to copy or print →
            </Link>
          )}
          {error && <p className="text-sm text-live">{error}</p>}
        </div>
      )}
    </section>
  );
}
