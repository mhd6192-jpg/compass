"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Confetti from "@/components/display/Confetti";
import { ClubMark } from "@/components/shared/ClubLogo";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import { formatMatchScoreLine } from "@/lib/scoring/format";
import type { MatchDTO } from "@/lib/types";

const BRAND_CONFETTI = ["#C9D935", "#1B8A3E", "#ffffff", "#D6DF20", "#0C3B20", "#8FBF3F"];

/**
 * Held celebration. Unlike v1's overlay this one has no timer at all: it stays
 * up until the coach on that court taps Finish. That is the whole point — the
 * winners get their moment on the screen for as long as the handshake, the
 * photo and the walk-off actually take.
 */
export default function WinnerScreen({
  courtLabel,
  match,
  winnerName,
  loserName,
}: {
  courtLabel: string;
  match: MatchDTO;
  winnerName: string;
  loserName: string;
}) {
  const style = BRACKET_STYLE[match.bracket];
  const isTitle = match.isChampionshipFinal;
  const scoreLine = match.forcedEnd ? match.forcedEndReason ?? "Walkover" : formatMatchScoreLine(match);

  // A quiet nudge, only once the celebration has clearly run its course, so a
  // coach who walked away can see why the screen has not moved on.
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setNudge(true), 25000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden relative flex flex-col items-center justify-center bg-court-bg v2-vignette">
      <div className={`absolute inset-0 opacity-[0.08] ${style.solidBg}`} />
      <div className="v2-rays absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[190vmax] h-[190vmax] rounded-full" />
      <Confetti count={isTitle ? 260 : 150} colors={BRAND_CONFETTI} />

      <motion.div
        initial={{ scale: 0.86, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.34, duration: 0.9 }}
        className="relative z-10 flex flex-col items-center text-center px-[6vw]"
      >
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", bounce: 0.55, delay: 0.18 }}
          style={{ fontSize: "clamp(3rem, 9vw, 10rem)", lineHeight: 1 }}
        >
          {isTitle ? "🏆" : "🎾"}
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="font-display uppercase text-gold tracking-[0.45em] mt-[2vh]"
          style={{ fontSize: "clamp(0.8rem, 1.9vw, 2rem)" }}
        >
          {isTitle ? "Tournament Champion" : "Winner"}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 30, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", bounce: 0.32, delay: 0.4 }}
          className="v2-shine font-display font-bold uppercase text-gold text-shadow-glow mt-[1vh] max-w-[92vw] break-words"
          style={{ fontSize: "clamp(3rem, 11vw, 13rem)", lineHeight: 0.95 }}
        >
          {winnerName}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-white/55 mt-[3vh]"
          style={{ fontSize: "clamp(1rem, 2.6vw, 2.8rem)" }}
        >
          def. <span className="text-white/80">{loserName}</span>
          {scoreLine ? <span className="text-gold/80"> · {scoreLine}</span> : null}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="flex items-center gap-[1.4vw] mt-[3.5vh] font-display uppercase tracking-[0.3em] text-white/35"
          style={{ fontSize: "clamp(0.65rem, 1.3vw, 1.4rem)" }}
        >
          <span>{courtLabel}</span>
          <span className="opacity-40">·</span>
          <span className={style.text}>{match.roundName}</span>
        </motion.div>
      </motion.div>

      <div className="absolute bottom-[3vh] left-0 right-0 flex items-center justify-between px-[3vw] z-10">
        <span className="opacity-50">
          <ClubMark size={38} />
        </span>
        {nudge && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-display uppercase tracking-[0.3em] text-white/25"
            style={{ fontSize: "clamp(0.55rem, 1vw, 1rem)" }}
          >
            Awaiting coach · Finish
          </motion.p>
        )}
      </div>
    </div>
  );
}
