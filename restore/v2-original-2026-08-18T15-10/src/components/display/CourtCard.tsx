"use client";

import { motion } from "framer-motion";
import { MatchDTO } from "@/lib/types";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import BracketBadge from "@/components/shared/BracketBadge";
import { ClubMark } from "@/components/shared/ClubLogo";
import { useMatchTierEvent } from "./useMatchTierEvent";

function ScoreRow({ match, slot }: { match: MatchDTO; slot: 1 | 2 }) {
  const st = match.state;
  const i = slot - 1;
  const player = slot === 1 ? match.player1 : match.player2;
  const isWinner = !!match.winnerId && player?.id === match.winnerId;
  const setCells = st.completedSets.map((s, idx) => ({ key: `s${idx}`, val: s.games[i], current: false }));
  if (st.currentSet) setCells.push({ key: "cur", val: st.currentSet.games[i], current: true });
  const pointLabel = st.currentGame ? st.currentGame.display[i] : null;

  return (
    <div className={`flex items-center gap-2 sm:gap-3 py-1.5 ${isWinner ? "text-gold" : "text-white"}`}>
      <span className={`flex-1 min-w-0 truncate font-display text-lg sm:text-2xl uppercase tracking-wide ${isWinner ? "font-bold" : ""}`}>
        {isWinner && "🏆 "}
        {player?.name ?? "TBD"}
      </span>
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {setCells.map((c) => (
          <span
            key={c.key}
            className={`w-6 sm:w-8 text-center font-display text-lg sm:text-2xl tabular-nums rounded ${
              c.current ? "text-white bg-white/10" : "text-white/60"
            }`}
          >
            {c.val}
          </span>
        ))}
        {pointLabel !== null && (
          <motion.span
            key={`${slot}-${pointLabel}-${st.totalPoints}`}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.6, duration: 0.35 }}
            className="w-12 sm:w-16 ml-1 text-center font-display font-bold text-2xl sm:text-4xl tabular-nums bg-gold text-pine-deep rounded-lg py-0.5"
          >
            {pointLabel}
          </motion.span>
        )}
      </div>
    </div>
  );
}

function AttractContent({ courtLabel }: { courtLabel: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 py-8">
      <span className="opacity-30">
        <ClubMark size={40} />
      </span>
      <p className="font-display uppercase tracking-widest text-sm text-white/50">{courtLabel} — awaiting next match</p>
    </div>
  );
}

export default function CourtCard({
  courtId,
  label,
  current,
  next,
}: {
  courtId: number;
  label: string;
  current: MatchDTO | null;
  next: MatchDTO | null;
}) {
  const tierEvent = useMatchTierEvent(current?.id);
  const isLive = current?.status === "in_progress";
  const style = current ? BRACKET_STYLE[current.bracket] : null;
  const stamp = tierEvent && (tierEvent.tier === "game" || tierEvent.tier === "set") ? tierEvent : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border bg-court-panel flex flex-col ${
        current ? style!.border : "border-court-line"
      } ${isLive ? "shadow-[0_0_34px_rgba(201,217,53,0.12)]" : ""}`}
    >
      {/* left accent bar in the match's bracket color */}
      {current && <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${style!.solidBg}`} />}

      {/* live shimmer sweep */}
      {isLive && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 bottom-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.05] to-transparent animate-shimmer" />
        </div>
      )}

      {/* color wash flash on game/set */}
      {stamp && (
        <motion.div
          key={`wash-${stamp.ts}`}
          initial={{ opacity: stamp.tier === "set" ? 0.6 : 0.35 }}
          animate={{ opacity: 0 }}
          transition={{ duration: stamp.tier === "set" ? 1.5 : 0.9, ease: "easeOut" }}
          className={`absolute inset-0 pointer-events-none ${style?.solidBg ?? "bg-gold"}`}
        />
      )}

      {/* GAME / SET stamp */}
      {stamp && (
        <motion.div
          key={`stamp-${stamp.ts}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: stamp.tier === "set" ? 1.7 : 1.15, times: [0, 0.15, 0.72, 1] }}
          className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
        >
          <motion.span
            initial={{ scale: 2.6, rotate: -8 }}
            animate={{ scale: 1, rotate: -8 }}
            transition={{ type: "spring", bounce: 0.45, duration: 0.5 }}
            className={`font-display font-bold uppercase text-gold drop-shadow-[0_0_22px_rgba(201,217,53,0.85)] ${
              stamp.tier === "set" ? "text-6xl sm:text-7xl" : "text-5xl sm:text-6xl"
            }`}
          >
            {stamp.tier === "set" ? "SET!" : "GAME!"}
          </motion.span>
        </motion.div>
      )}

      <div className="relative flex items-center justify-between pl-4 pr-4 pt-3">
        <div className="flex items-center gap-2.5">
          <span className="font-display font-bold uppercase tracking-widest text-sm sm:text-base text-white/90">Court {courtId}</span>
          {current && <BracketBadge bracket={current.bracket} roundName={current.roundName} size="sm" />}
        </div>
        {isLive && (
          <span className="flex items-center gap-1.5 rounded-full bg-live/15 border border-live/40 px-2 py-0.5 text-live text-[10px] sm:text-xs font-bold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" /> Live
          </span>
        )}
      </div>

      {current ? (
        <div className="relative flex-1 flex flex-col justify-center pl-4 pr-4 py-2.5">
          <ScoreRow match={current} slot={1} />
          <div className="h-px bg-white/5 mx-1" />
          <ScoreRow match={current} slot={2} />
        </div>
      ) : (
        <AttractContent courtLabel={label} />
      )}

      <div className="relative border-t border-court-line pl-4 pr-4 py-2 flex items-center gap-2 text-xs sm:text-sm">
        <span className="uppercase tracking-widest font-display text-gold/70 text-[10px] sm:text-xs shrink-0">Up next</span>
        {next ? (
          <span className="truncate text-white/60">
            {next.player1?.name ?? "TBD"} <span className="text-white/50">vs</span> {next.player2?.name ?? "TBD"}
          </span>
        ) : (
          <span className="text-white/50">—</span>
        )}
      </div>
    </motion.div>
  );
}
