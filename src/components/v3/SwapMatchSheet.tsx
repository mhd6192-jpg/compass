"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import BracketBadge from "@/components/shared/BracketBadge";
import { candidateLocation, eligibleReplacements } from "@/lib/v3/swap";
import type { MatchDTO } from "@/lib/types";

/**
 * The coach's "someone isn't here" escape hatch.
 *
 * Shows only matches that can genuinely start on this court right now, so a
 * coach tapping in a hurry cannot double-book a team onto two courts. The
 * teams that aren't available are still worth showing — a coach who can't find
 * the match they expected will otherwise assume the app is broken — so they sit
 * underneath, greyed, with the reason.
 */
export default function SwapMatchSheet({
  courtId,
  outgoing,
  matches,
  busy,
  retrying = false,
  onPick,
  onClose,
}: {
  courtId: number;
  outgoing: MatchDTO;
  matches: MatchDTO[];
  busy: boolean;
  retrying?: boolean;
  onPick: (matchId: string) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const options = eligibleReplacements(matches, outgoing);

  const blocked = matches.filter(
    (m) =>
      m.id !== outgoing.id &&
      m.status !== "completed" &&
      !options.some((o) => o.id === m.id) &&
      (m.player1 || m.player2 || m.status !== "pending")
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-court-bg/95 backdrop-blur-sm">
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-4 border-b border-court-line">
        <div className="min-w-0">
          <h2 className="font-display uppercase font-bold text-lg">Change the match</h2>
          <p className="text-white/45 text-xs truncate">
            Court {courtId} · replacing {outgoing.player1?.name ?? "TBD"} vs {outgoing.player2?.name ?? "TBD"}
          </p>
        </div>
        <button
          onClick={onClose}
          disabled={busy}
          className="shrink-0 rounded-xl border border-court-line px-4 py-2 font-display uppercase text-xs text-white/60"
        >
          Cancel
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {options.length === 0 && (
          <div className="rounded-2xl border border-court-line bg-court-panel p-6 text-center">
            <p className="font-display uppercase text-white/70">No other match can start here</p>
            <p className="text-white/40 text-xs mt-2">
              Every other match is either finished, already being played, or waiting on a team that is on another court.
            </p>
          </div>
        )}

        {options.map((m) => {
          const where = candidateLocation(m);
          return (
            <motion.button
              key={m.id}
              whileTap={{ scale: 0.98 }}
              disabled={busy}
              onClick={() => {
                setPicked(m.id);
                onPick(m.id);
              }}
              className={`rounded-2xl border bg-court-panel p-4 text-left disabled:opacity-50 ${
                picked === m.id ? "border-gold" : "border-court-line"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <BracketBadge bracket={m.bracket} roundName={m.roundName} size="sm" />
                {where && <span className="text-white/35 text-[11px] uppercase tracking-wider shrink-0">{where}</span>}
              </div>
              {picked === m.id && retrying && (
                <p className="font-display uppercase tracking-[0.2em] text-gold text-[11px] mb-1">Reconnecting…</p>
              )}
              <p className="font-display font-bold uppercase text-lg break-words leading-tight">
                {m.player1?.name ?? "TBD"}
              </p>
              <p className="text-gold/60 font-display uppercase text-xs my-0.5">vs</p>
              <p className="font-display font-bold uppercase text-lg break-words leading-tight">
                {m.player2?.name ?? "TBD"}
              </p>
            </motion.button>
          );
        })}

        {blocked.length > 0 && (
          <>
            <p className="font-display uppercase text-white/30 text-xs tracking-widest mt-3">Not available</p>
            {blocked.map((m) => (
              <div key={m.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-3 opacity-60">
                <p className="text-white/50 text-sm truncate">
                  {m.player1?.name ?? "TBD"} vs {m.player2?.name ?? "TBD"}
                </p>
                <p className="text-white/30 text-[11px] mt-1">
                  {m.status === "in_progress"
                    ? "Being played right now"
                    : !m.player1 || !m.player2
                      ? "Waiting on an earlier result"
                      : m.state.totalPoints > 0
                        ? "Already part-scored"
                        : "A team is on another court"}
                </p>
              </div>
            ))}
          </>
        )}
      </div>

      <footer className="shrink-0 px-4 py-3 border-t border-court-line">
        <p className="text-white/35 text-xs text-center">
          The match you replace goes back in the queue — nobody loses their place.
        </p>
      </footer>
    </div>
  );
}
