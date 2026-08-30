"use client";

import { motion } from "framer-motion";
import V3Standings from "./V3Standings";
import IdleSpotlight from "./IdleSpotlight";
import ClubLogo, { ClubMark } from "@/components/shared/ClubLogo";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import type { MatchDTO } from "@/lib/types";

function UpcomingCard({ courtLabel, match }: { courtLabel: string; match: MatchDTO | null }) {
  if (!match) {
    return (
      <div className="rounded-3xl border border-court-line bg-court-panel flex flex-col items-center justify-center gap-[1.5vh] py-[4vh]">
        <span className="opacity-25 v3-breathe">
          <ClubMark size={54} />
        </span>
        <p className="font-display uppercase tracking-[0.3em] text-white/40" style={{ fontSize: "clamp(0.7rem, 1.4vw, 1.4rem)" }}>
          {courtLabel} — awaiting the next match
        </p>
      </div>
    );
  }

  const style = BRACKET_STYLE[match.bracket];

  return (
    <motion.div
      key={match.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative overflow-hidden rounded-3xl border-2 bg-court-panel px-[3vw] py-[3vh] ${style.border}`}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-[0.5vw] ${style.solidBg}`} />

      <div className="flex items-center justify-between gap-[2vw] mb-[2vh]">
        <p className="font-display uppercase tracking-[0.35em] text-gold" style={{ fontSize: "clamp(0.7rem, 1.4vw, 1.5rem)" }}>
          Next on {courtLabel}
        </p>
        <p className={`font-display uppercase tracking-[0.25em] ${style.text}`} style={{ fontSize: "clamp(0.65rem, 1.3vw, 1.4rem)" }}>
          {match.roundName}
        </p>
      </div>

      <div className="flex items-center gap-[2vw]">
        <p
          className="flex-1 min-w-0 truncate font-display font-bold uppercase text-white text-right"
          style={{ fontSize: "clamp(1.6rem, 4.4vw, 5rem)", lineHeight: 1.05 }}
        >
          {match.player1?.name ?? "TBD"}
        </p>
        <span
          className="font-display uppercase text-gold/70 shrink-0"
          style={{ fontSize: "clamp(0.9rem, 2.2vw, 2.4rem)" }}
        >
          vs
        </span>
        <p
          className="flex-1 min-w-0 truncate font-display font-bold uppercase text-white"
          style={{ fontSize: "clamp(1.6rem, 4.4vw, 5rem)", lineHeight: 1.05 }}
        >
          {match.player2?.name ?? "TBD"}
        </p>
      </div>
    </motion.div>
  );
}

/**
 * What a court's TV shows between matches: the match this court plays next,
 * then the standings underneath. Deliberately only this court's fixture —
 * players walking on look up and see their own name, not a venue-wide grid.
 */
export default function CourtIdleScreen({
  courtLabel,
  upcoming,
  onDeck,
  matches,
  format,
  progress,
}: {
  courtLabel: string;
  upcoming: MatchDTO | null;
  onDeck: MatchDTO | null;
  matches: MatchDTO[];
  format?: string;
  progress: { completed: number; total: number };
}) {
  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-court-bg">
      <header className="shrink-0 flex items-center justify-between px-[3vw] py-[2vh] border-b border-white/5">
        <ClubLogo size={44} />
        <div className="text-right">
          <p className="font-display uppercase tracking-[0.35em] text-gold/80" style={{ fontSize: "clamp(0.55rem, 1vw, 1rem)" }}>
            {courtLabel}
          </p>
          <p className="text-white/40" style={{ fontSize: "clamp(0.65rem, 1.2vw, 1.2rem)" }}>
            {progress.completed} of {progress.total} matches complete
          </p>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col gap-[2vh] px-[3vw] py-[2vh]">
        <div className="shrink-0">
          <UpcomingCard courtLabel={courtLabel} match={upcoming} />
          {onDeck && (
            <p className="mt-[1.2vh] text-white/35 truncate" style={{ fontSize: "clamp(0.65rem, 1.2vw, 1.2rem)" }}>
              <span className="font-display uppercase tracking-[0.3em] text-gold/50 mr-[1vw]">Then</span>
              {onDeck.player1?.name ?? "TBD"} vs {onDeck.player2?.name ?? "TBD"}
            </p>
          )}
        </div>

        {/* Standings keep the floor; the spotlight takes a third so a court that
            sits idle for half an hour still has something to look at. */}
        <div className="flex-1 min-h-0 flex gap-[1.5vw]">
          <div className="flex-1 min-w-0 flex">
            <V3Standings matches={matches} title="Standings" format={format} />
          </div>
          <div className="w-[26%] shrink-0 flex">
            <div className="flex-1 flex">
              <IdleSpotlight matches={matches} format={format} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
