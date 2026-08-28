"use client";

import { motion } from "framer-motion";
import type { MatchDTO } from "@/lib/types";

/** Per-side score for the scoreboard rows. Points-race formats keep their raw
 * point totals; anything with sets falls back to the set count. */
function sideScores(m: MatchDTO): [string, string] | null {
  // A tie that has not been played yet reads as names only — a 0-0 beside "TBD"
  // is noise, not information.
  if (m.status !== "in_progress" && m.status !== "completed") return null;
  const st = m.state;
  if (st.completedSets.length) {
    const s = st.completedSets[st.completedSets.length - 1];
    const isWholeMatchRace = !!s.tiebreak && s.games[0] + s.games[1] === 1;
    if (isWholeMatchRace) return [String(s.tiebreak![0]), String(s.tiebreak![1])];
    return [String(st.setsWon[0]), String(st.setsWon[1])];
  }
  if (st.currentGame) return [st.currentGame.display[0], st.currentGame.display[1]];
  return null;
}

function Side({ match, slot }: { match: MatchDTO; slot: 1 | 2 }) {
  const player = slot === 1 ? match.player1 : match.player2;
  const isWinner = !!match.winnerId && player?.id === match.winnerId;
  const scores = sideScores(match);
  return (
    <div className={`flex items-center gap-2 ${isWinner ? "text-gold" : "text-white/85"}`}>
      <span className={`flex-1 min-w-0 truncate font-display uppercase text-[0.95em] ${isWinner ? "font-bold" : ""}`}>
        {player?.name ?? "TBD"}
      </span>
      {scores && (
        <span className="shrink-0 font-display tabular-nums text-[0.95em] w-[1.8em] text-center">{scores[slot - 1]}</span>
      )}
    </div>
  );
}

function Tie({ match, label, big = false }: { match: MatchDTO; label: string; big?: boolean }) {
  const live = match.status === "in_progress";
  const done = match.status === "completed";
  return (
    <motion.div
      layout
      className={`rounded-2xl border bg-court-panel px-4 py-3 ${big ? "text-2xl border-gold/60" : "text-lg border-court-line"} ${
        live ? "shadow-[0_0_28px_rgba(201,217,53,0.16)] border-gold/40" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className={`font-display uppercase tracking-[0.25em] text-[0.5em] ${big ? "text-gold" : "text-white/45"}`}>{label}</p>
        {live && (
          <span className="flex items-center gap-1 text-live text-[0.5em] font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" /> Live
          </span>
        )}
        {done && <span className="text-white/30 text-[0.5em] uppercase tracking-wider">Final score</span>}
      </div>
      <Side match={match} slot={1} />
      <div className="h-px bg-white/5 my-1.5" />
      <Side match={match} slot={2} />
    </motion.div>
  );
}

/** The knockout stage of the two-group draw: both semifinals feeding the final. */
export default function KnockoutPanel({ semis, final }: { semis: MatchDTO[]; final: MatchDTO | undefined }) {
  return (
    <div className="rounded-2xl border border-court-line bg-court-panel/40 p-4 sm:p-6 flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 mb-4 shrink-0">
        <h2 className="font-display uppercase text-xl sm:text-2xl text-gold">Knockout</h2>
        <p className="text-white/50 text-[10px] sm:text-xs uppercase tracking-wide text-right">Top two of each group</p>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 sm:gap-6">
        <div className="flex flex-col gap-4">
          {semis.map((m, i) => (
            <Tie key={m.id} match={m} label={`Semifinal ${i + 1}`} />
          ))}
        </div>
        <div className="hidden lg:flex flex-col items-center text-white/20">
          <div className="w-px flex-1 bg-white/10" />
          <span className="py-2 text-2xl">→</span>
          <div className="w-px flex-1 bg-white/10" />
        </div>
        {final && <Tie match={final} label="Final" big />}
      </div>
    </div>
  );
}
