"use client";

import { motion } from "framer-motion";
import Confetti from "./Confetti";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import { BRACKET_LABELS, BracketCode } from "@/lib/types";
import { ClubMark } from "@/components/shared/ClubLogo";

export interface Celebration {
  key: string;
  tier: "match" | "champion";
  bracket: BracketCode;
  roundName: string;
  winnerName?: string;
  loserName?: string;
  scoreLine: string;
}

export default function CelebrationOverlay({ celebration }: { celebration: Celebration | null }) {
  // Plain conditional render (no AnimatePresence exit-tracking): guarantees the node is
  // actually removed the instant `celebration` goes null, even if completions arrive in
  // rapid succession.
  if (!celebration) return null;

  const isChampion = celebration.tier === "champion";

  return (
    <motion.div
      key={celebration.key}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/75"
    >
      {/* rotating light rays behind the card */}
      <motion.div
        className="celebration-rays absolute w-[150vmax] h-[150vmax] rounded-full"
        style={{ opacity: isChampion ? 0.75 : 0.4 }}
        animate={{ rotate: 360 }}
        transition={{ duration: isChampion ? 22 : 34, ease: "linear", repeat: Infinity }}
      />

      <Confetti count={isChampion ? 200 : 60} />

      <motion.div
        initial={{ scale: 0.55, opacity: 0, y: 36 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.5, duration: 0.75 }}
        className={`relative text-center px-10 py-8 sm:px-16 sm:py-12 rounded-3xl border-2 bg-court-panel/95 backdrop-blur ${
          isChampion ? "border-gold shadow-[0_0_80px_rgba(201,217,53,0.35)]" : BRACKET_STYLE[celebration.bracket].border
        }`}
      >
        {isChampion && (
          <div className="flex items-center justify-center gap-2 mb-3 opacity-90">
            <ClubMark size={22} />
            <span className="font-display uppercase tracking-[0.3em] text-white/50 text-[10px]">Alhayat Compass Draw</span>
          </div>
        )}

        <motion.p
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", bounce: 0.65, delay: 0.15 }}
          className={isChampion ? "text-7xl sm:text-8xl mb-4" : "text-5xl mb-3"}
        >
          {isChampion ? "🏆" : "🎉"}
        </motion.p>

        <p
          className={`font-display uppercase tracking-[0.3em] mb-2 ${
            isChampion ? "text-gold text-lg sm:text-xl" : "text-white/50 text-sm"
          }`}
        >
          {isChampion ? "Tournament Champion" : `${BRACKET_LABELS[celebration.bracket]} · ${celebration.roundName}`}
        </p>

        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className={`font-display font-bold uppercase text-shadow-glow ${
            isChampion ? "text-6xl sm:text-8xl text-gold" : "text-4xl sm:text-5xl"
          }`}
        >
          {celebration.winnerName}
        </motion.h2>

        {celebration.loserName && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="text-white/45 mt-3 text-sm sm:text-lg"
          >
            def. {celebration.loserName} · {celebration.scoreLine}
          </motion.p>
        )}
      </motion.div>
    </motion.div>
  );
}
