"use client";

import { motion } from "framer-motion";
import type { MatchDTO } from "@/lib/types";
import { computeStandings, findDecider } from "@/lib/standings";
import ClubLogo from "@/components/shared/ClubLogo";

/** End-of-group winner presentation. Only shown once every match is played,
 * so the podium can never crown someone while results are still coming in. */
export default function GroupChampion({ matches }: { matches: MatchDTO[] }) {
  const standings = computeStandings(matches);
  const champ = standings[0];
  const second = standings[1];
  const third = standings[2];
  if (!champ) return null;

  // How the title was actually settled, in the order the ranking applies it:
  // a played play-off outranks the points tiebreak, which only counts if the
  // points genuinely differ (otherwise the split was alphabetical, not earned).
  const playoff = findDecider(matches);
  const wonPlayoff = playoff?.status === "completed";
  const decidedOnPoints = !wonPlayoff && !!second && second.won === champ.won && second.pointsFor !== champ.pointsFor;

  return (
    // Sits next to the final table on the TV, so everything here has to survive a
    // half-width column: nothing fixed-width, and the trophy keeps its own headroom
    // (the pulse scales it up) instead of being clipped by the panel edge.
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-5 px-2 py-2 text-center overflow-hidden">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.45, duration: 0.9 }}
        className="w-full"
      >
        <motion.p
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
          className="text-6xl sm:text-7xl leading-none mb-3 origin-bottom"
        >
          🏆
        </motion.p>
        <p className="font-display uppercase tracking-[0.5em] text-gold/80 text-xs sm:text-sm mb-2">Group Champion</p>
        <h1 className="font-display uppercase font-bold text-4xl sm:text-5xl xl:text-6xl text-white text-shadow-glow leading-tight break-words">
          {champ.name}
        </h1>
        <p className="text-white/70 text-lg sm:text-xl mt-3 font-display">
          {champ.won} wins · {champ.lost} losses · {champ.pointsFor} points scored
        </p>
        {wonPlayoff && (
          <p className="text-gold/80 text-xs sm:text-sm mt-2 uppercase tracking-widest">
            Won the deciding final v {second?.name}
          </p>
        )}
        {decidedOnPoints && (
          <p className="text-gold/80 text-xs sm:text-sm mt-2 uppercase tracking-widest">
            Decided on points scored ({champ.pointsFor} v {second!.pointsFor})
          </p>
        )}
      </motion.div>

      {(second || third) && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-wrap items-end justify-center gap-3 sm:gap-6"
        >
          {second && (
            <div className="text-center rounded-2xl border border-white/15 bg-court-panel px-5 py-3">
              <p className="text-2xl sm:text-3xl mb-1 leading-none">🥈</p>
              <p className="font-display uppercase text-base sm:text-lg text-white">{second.name}</p>
              <p className="text-white/50 text-xs sm:text-sm">
                {second.won}W · {second.pointsFor} pts
              </p>
            </div>
          )}
          {third && (
            <div className="text-center rounded-2xl border border-white/10 bg-court-panel px-5 py-2.5">
              <p className="text-xl sm:text-2xl mb-1 leading-none">🥉</p>
              <p className="font-display uppercase text-sm sm:text-base text-white/90">{third.name}</p>
              <p className="text-white/40 text-xs sm:text-sm">
                {third.won}W · {third.pointsFor} pts
              </p>
            </div>
          )}
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="flex items-center gap-3">
        <ClubLogo size={30} />
        <p className="text-white/40 uppercase tracking-[0.3em] text-[10px] sm:text-xs">Tournament Complete</p>
      </motion.div>
    </div>
  );
}
