"use client";

import Link from "next/link";
import ConnectionGate from "@/components/shared/ConnectionGate";
import RoundRobinStandings from "@/components/display/RoundRobinStandings";
import GroupChampion from "@/components/display/GroupChampion";
import { ClubMark } from "@/components/shared/ClubLogo";
import { useCompassStore } from "@/store/useCompassStore";

function StandingsContent() {
  const snapshot = useCompassStore((s) => s.snapshot)!;
  const allPlayed = snapshot.progress.total > 0 && snapshot.progress.completed === snapshot.progress.total;
  const twoGroup = snapshot.tournament.format === "two-group";

  return (
    <main className="min-h-screen p-4 pb-10 max-w-lg mx-auto">
      <header className="flex items-center gap-3 mb-5 sticky top-0 bg-court-bg/95 backdrop-blur py-3 -mx-4 px-4 z-10 border-b border-court-line">
        <Link href="/scorer" className="text-white/50 text-xl px-1">
          ‹
        </Link>
        <ClubMark size={34} />
        <div>
          <p className="font-display uppercase tracking-[0.3em] text-gold/80 text-[10px]">Compass Draw</p>
          <h1 className="font-display text-xl uppercase font-bold leading-none">Standings</h1>
        </div>
      </header>
      {allPlayed && !twoGroup && (
        <div className="mb-6 rounded-2xl border border-gold/40 bg-gold/5 py-8">
          <GroupChampion matches={snapshot.matches} />
        </div>
      )}
      {twoGroup ? (
        <div className="flex flex-col gap-4">
          <RoundRobinStandings matches={snapshot.matches.filter((m) => m.bracket === "GA")} title="Group A" note="Top two qualify" />
          <RoundRobinStandings matches={snapshot.matches.filter((m) => m.bracket === "GB")} title="Group B" note="Top two qualify" />
        </div>
      ) : (
        <RoundRobinStandings matches={snapshot.matches} title={allPlayed ? "Final Standings" : "Standings"} final={allPlayed} />
      )}
    </main>
  );
}

export default function StandingsPage() {
  return (
    <ConnectionGate>
      <StandingsContent />
    </ConnectionGate>
  );
}
