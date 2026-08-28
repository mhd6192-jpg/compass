"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Confetti from "@/components/display/Confetti";
import Trophy from "./Trophy";
import { ClubMark } from "@/components/shared/ClubLogo";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import { formatMatchScoreLine } from "@/lib/scoring/format";
import type { MatchDTO } from "@/lib/types";

const BRAND_CONFETTI = ["#C9D935", "#1B8A3E", "#ffffff", "#D6DF20", "#0C3B20", "#8FBF3F"];

/** How long the screen teases before the name lands. */
const BUILD_MS = 2400;

/**
 * Held celebration, in two beats.
 *
 * The name does not appear straight away: the screen first says *that* there is
 * a winner and makes everyone look up, and only then lands the name. A result
 * that simply pops onto a TV gets no reaction — a two-second build gets the
 * whole court watching before the reveal.
 *
 * Unlike v1's overlay there is no dismiss timer at all. It stays until the
 * coach on that court taps Finish, so the handshake, the photo and the walk-off
 * all happen with the winners still on screen.
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

  const [revealed, setRevealed] = useState(false);
  const [nudge, setNudge] = useState(false);

  // Restart the build whenever a different match takes the screen.
  useEffect(() => {
    setRevealed(false);
    setNudge(false);
    const reveal = setTimeout(() => setRevealed(true), BUILD_MS);
    // A quiet nudge, only once the celebration has clearly run its course, so a
    // coach who walked away can see why the screen has not moved on.
    const hint = setTimeout(() => setNudge(true), BUILD_MS + 25000);
    return () => {
      clearTimeout(reveal);
      clearTimeout(hint);
    };
  }, [match.id]);

  return (
    <div className="h-screen w-screen overflow-hidden relative flex flex-col items-center justify-center bg-court-bg v3-vignette">
      <div className={`absolute inset-0 opacity-[0.08] ${style.solidBg}`} />
      <div className="v3-rays absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[190vmax] h-[190vmax] rounded-full" />

      {/* confetti only on the reveal — dropping it during the build would give the moment away */}
      {revealed && <Confetti count={isTitle ? 280 : 160} colors={BRAND_CONFETTI} />}

      {/* white flash on the cut from build to reveal */}
      {revealed && (
        <motion.div
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="absolute inset-0 bg-white pointer-events-none z-20"
        />
      )}

      <div className="relative z-10 flex flex-col items-center text-center px-[6vw] w-full">
        {/* ---------------------------------------------------------- build */}
        {!revealed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-[3vh]"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "linear" }}
              style={{ fontSize: "clamp(3rem, 8vw, 8rem)", lineHeight: 1 }}
            >
              🎾
            </motion.div>

            <motion.p
              animate={{ opacity: [0.45, 1, 0.45] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              className="font-display uppercase text-white tracking-[0.35em]"
              style={{ fontSize: "clamp(1.2rem, 3.6vw, 4rem)" }}
            >
              {isTitle ? "And your champion is" : "And the winner is"}
            </motion.p>

            <motion.div
              className="h-[0.5vh] bg-gold rounded-full"
              initial={{ width: 0 }}
              animate={{ width: "38vw" }}
              transition={{ duration: BUILD_MS / 1000, ease: "linear" }}
            />

            <p
              className="font-display uppercase tracking-[0.3em] text-white/35"
              style={{ fontSize: "clamp(0.65rem, 1.3vw, 1.4rem)" }}
            >
              {courtLabel} · <span className={style.text}>{match.roundName}</span>
            </p>
          </motion.div>
        )}

        {/* --------------------------------------------------------- reveal */}
        {revealed && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.8 }}
            className="flex flex-col items-center w-full"
          >
            {isTitle ? (
              <Trophy size={Math.min(260, typeof window === "undefined" ? 220 : window.innerHeight * 0.26)} />
            ) : (
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", bounce: 0.6, delay: 0.1 }}
                style={{ fontSize: "clamp(2.5rem, 7vw, 7rem)", lineHeight: 1 }}
              >
                🏅
              </motion.div>
            )}

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="font-display uppercase text-gold tracking-[0.45em] mt-[1.5vh]"
              style={{ fontSize: "clamp(0.8rem, 1.9vw, 2rem)" }}
            >
              {isTitle ? "Tournament Champion" : "Winner"}
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 40, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", bounce: 0.4, delay: 0.28 }}
              className="v3-shine font-display font-bold uppercase text-gold text-shadow-glow mt-[1vh] max-w-[92vw] break-words"
              style={{ fontSize: "clamp(3rem, 11vw, 13rem)", lineHeight: 0.95 }}
            >
              {winnerName}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-white/55 mt-[2.5vh]"
              style={{ fontSize: "clamp(1rem, 2.6vw, 2.8rem)" }}
            >
              def. <span className="text-white/80">{loserName}</span>
              {scoreLine ? <span className="text-gold/80"> · {scoreLine}</span> : null}
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="flex items-center gap-[1.4vw] mt-[3vh] font-display uppercase tracking-[0.3em] text-white/35"
              style={{ fontSize: "clamp(0.65rem, 1.3vw, 1.4rem)" }}
            >
              <span>{courtLabel}</span>
              <span className="opacity-40">·</span>
              <span className={style.text}>{match.roundName}</span>
            </motion.div>
          </motion.div>
        )}
      </div>

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
