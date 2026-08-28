"use client";

import { motion } from "framer-motion";
import ClubLogo from "@/components/shared/ClubLogo";

/**
 * Every match is played and the organiser has not started the presentation yet.
 *
 * Deliberately shows no table: the standings stay off the screens so the
 * placings are still a surprise when the awards are announced.
 */
export default function WaitingScreen({ courtLabel }: { courtLabel: string }) {
  return (
    <div className="h-screen w-screen overflow-hidden relative flex flex-col items-center justify-center bg-court-bg v3-vignette">
      <div className="absolute inset-0 v3-stage-light" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 flex flex-col items-center text-center gap-[3vh] px-[6vw]"
      >
        <span className="v3-breathe">
          <ClubLogo size={72} />
        </span>

        <h1
          className="font-display font-bold uppercase text-white tracking-tight"
          style={{ fontSize: "clamp(2rem, 6.5vw, 7rem)", lineHeight: 1 }}
        >
          All matches complete
        </h1>

        <p className="font-display uppercase tracking-[0.42em] text-gold" style={{ fontSize: "clamp(0.8rem, 2vw, 2.2rem)" }}>
          Awaiting the results presentation
        </p>

        <div className="flex items-center gap-[1vw] mt-[1vh]">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="rounded-full bg-gold/70"
              style={{ width: "0.8vw", height: "0.8vw", minWidth: 8, minHeight: 8 }}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.22 }}
            />
          ))}
        </div>
      </motion.div>

      <p
        className="absolute bottom-[3vh] font-display uppercase tracking-[0.3em] text-white/20"
        style={{ fontSize: "clamp(0.55rem, 1vw, 1rem)" }}
      >
        {courtLabel}
      </p>
    </div>
  );
}
