"use client";

import { motion } from "framer-motion";
import V2Standings from "./V2Standings";
import Trophy from "./Trophy";
import ClubLogo from "@/components/shared/ClubLogo";
import { computePodium } from "@/lib/v2/podium";
import type { MatchDTO } from "@/lib/types";

/**
 * What the court screens rest on once the awards have been given out.
 *
 * This is the screen players walk up to and photograph, so it is built as a
 * keepsake rather than an information panel: the champion named at the top
 * beside the cup, medals down the table, and the club's mark in shot.
 */
export default function FinalStandingsScreen({
  courtLabel,
  matches,
  format,
}: {
  courtLabel: string;
  matches: MatchDTO[];
  format?: string;
}) {
  // The champion comes from the podium, not from a merged table: in a knockout
  // the title is settled by the final, and whoever tops a group table need not
  // be the one who lifted the trophy.
  const champion = computePodium(matches, format ?? "")[0];

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-court-bg relative">
      <div className="absolute inset-0 v2-stage-light pointer-events-none" />

      <header className="relative shrink-0 flex items-center justify-between px-[3vw] py-[2vh] border-b border-white/5">
        <ClubLogo size={46} />
        <p
          className="font-display uppercase tracking-[0.35em] text-white/30"
          style={{ fontSize: "clamp(0.55rem, 1vw, 1rem)" }}
        >
          {courtLabel}
        </p>
      </header>

      <main className="relative flex-1 min-h-0 flex flex-col gap-[2vh] px-[3vw] py-[2vh]">
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="shrink-0 flex items-center justify-center gap-[2.5vw]"
        >
          <Trophy size={Math.min(150, typeof window === "undefined" ? 120 : window.innerHeight * 0.15)} />
          <div className="min-w-0 text-left">
            <p
              className="font-display uppercase tracking-[0.4em] text-gold"
              style={{ fontSize: "clamp(0.7rem, 1.5vw, 1.6rem)" }}
            >
              Tournament Champion
            </p>
            <h1
              className="font-display font-bold uppercase text-gold text-shadow-glow truncate"
              style={{ fontSize: "clamp(1.8rem, 5.4vw, 6rem)", lineHeight: 1.05 }}
            >
              {champion?.name ?? "—"}
            </h1>
          </div>
        </motion.div>

        <div className="flex-1 min-h-0 flex">
          <V2Standings matches={matches} title="Final Standings" subtitle="Congratulations to every team" format={format} />
        </div>
      </main>
    </div>
  );
}
