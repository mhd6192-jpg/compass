"use client";

import { motion } from "framer-motion";
import type { MatchDTO } from "@/lib/types";
import ClubLogo from "@/components/shared/ClubLogo";
import RoundRobinStandings from "./RoundRobinStandings";
import KnockoutPanel from "./KnockoutPanel";

export function splitTwoGroup(matches: MatchDTO[]) {
  const groupA = matches.filter((m) => m.bracket === "GA");
  const groupB = matches.filter((m) => m.bracket === "GB");
  const semis = matches.filter((m) => m.bracket === "SF").sort((a, b) => a.posIndex - b.posIndex);
  const final = matches.find((m) => m.bracket === "F");
  const groupsDone = groupA.length > 0 && [...groupA, ...groupB].every((m) => m.status === "completed");
  const semisSeeded = semis.some((m) => !!m.player1 && !!m.player2);
  return { groupA, groupB, semis, final, groupsDone, semisSeeded };
}

function sideName(m: MatchDTO, which: "winner" | "loser") {
  const id = which === "winner" ? m.winnerId : m.loserId;
  if (!id) return null;
  return m.player1?.id === id ? m.player1?.name ?? null : m.player2?.name ?? null;
}

/** End of the two-group draw: the final settled it, so the champion comes off
 * that match rather than off a table. Both beaten semifinalists share third. */
function TwoGroupChampion({ semis, final }: { semis: MatchDTO[]; final: MatchDTO }) {
  const champion = sideName(final, "winner");
  const runnerUp = sideName(final, "loser");
  const thirds = semis.map((m) => sideName(m, "loser")).filter((n): n is string => !!n && n !== runnerUp);

  return (
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
        <p className="font-display uppercase tracking-[0.5em] text-gold/80 text-xs sm:text-sm mb-2">Champion</p>
        <h1 className="font-display uppercase font-bold text-4xl sm:text-5xl xl:text-6xl text-white text-shadow-glow leading-tight break-words">
          {champion}
        </h1>
        {runnerUp && <p className="text-white/70 text-lg sm:text-xl mt-3 font-display">Beat {runnerUp} in the final</p>}
      </motion.div>

      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex flex-wrap items-end justify-center gap-3 sm:gap-6"
      >
        {runnerUp && (
          <div className="text-center rounded-2xl border border-white/15 bg-court-panel px-5 py-3">
            <p className="text-2xl sm:text-3xl mb-1 leading-none">🥈</p>
            <p className="font-display uppercase text-base sm:text-lg text-white">{runnerUp}</p>
            <p className="text-white/50 text-xs sm:text-sm">Finalist</p>
          </div>
        )}
        {thirds.map((name) => (
          <div key={name} className="text-center rounded-2xl border border-white/10 bg-court-panel px-5 py-2.5">
            <p className="text-xl sm:text-2xl mb-1 leading-none">🥉</p>
            <p className="font-display uppercase text-sm sm:text-base text-white/90">{name}</p>
            <p className="text-white/40 text-xs sm:text-sm">Semifinalist</p>
          </div>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }} className="flex items-center gap-3">
        <ClubLogo size={30} />
        <p className="text-white/40 uppercase tracking-[0.3em] text-[10px] sm:text-xs">Tournament Complete</p>
      </motion.div>
    </div>
  );
}

/**
 * TV layout for the two-group draw. It moves through the event: both group
 * tables while the groups are running, the knockout bracket once the
 * semifinalists are known, then the champion once the final is in.
 */
export default function TwoGroupScene({ matches }: { matches: MatchDTO[] }) {
  const { groupA, groupB, semis, final, semisSeeded } = splitTwoGroup(matches);

  if (final?.status === "completed") {
    return <TwoGroupChampion semis={semis} final={final} />;
  }

  if (semisSeeded) {
    return <KnockoutPanel semis={semis} final={final} />;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 sm:gap-6">
      <div className="flex min-h-0 flex-1">
        <RoundRobinStandings matches={groupA} title="Group A" autoFit note="Top two qualify" />
      </div>
      <div className="flex min-h-0 flex-1">
        <RoundRobinStandings matches={groupB} title="Group B" autoFit note="Top two qualify" />
      </div>
    </div>
  );
}
