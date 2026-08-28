"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ConnectionGate from "@/components/shared/ConnectionGate";
import BracketBadge from "@/components/shared/BracketBadge";
import PinBar from "@/components/scorer/PinBar";
import { ClubMark } from "@/components/shared/ClubLogo";
import { useCompassStore } from "@/store/useCompassStore";
import { MatchDTO } from "@/lib/types";
import { motion } from "framer-motion";

function MatchRow({ match, courtLabel }: { match: MatchDTO; courtLabel?: string }) {
  const router = useRouter();
  const scoreBits: string[] = [];
  if (match.state.setsWon[0] || match.state.setsWon[1]) {
    scoreBits.push(`Sets ${match.state.setsWon[0]}-${match.state.setsWon[1]}`);
  }
  if (match.state.currentGame) {
    scoreBits.push(`${match.state.currentGame.display[0]}-${match.state.currentGame.display[1]}`);
  }

  const canQuickScore = !!match.player1 && !!match.player2 && match.status !== "completed";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-2xl border border-court-line bg-court-panel p-4 flex items-center gap-3 active:border-gold/60"
    >
      <button onClick={() => router.push(`/scorer/${match.id}`)} className="flex-1 min-w-0 text-left flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <BracketBadge bracket={match.bracket} roundName={match.roundName} size="sm" />
            {courtLabel && <span className="text-[10px] uppercase tracking-wide text-white/40 font-display">{courtLabel}</span>}
            {match.status === "in_progress" && (
              <span className="flex items-center gap-1 text-[10px] uppercase text-live font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" /> Live
              </span>
            )}
          </div>
          <p className="font-display text-base truncate">
            {match.player1?.name ?? "TBD"} <span className="text-white/30">vs</span> {match.player2?.name ?? "TBD"}
          </p>
          {scoreBits.length > 0 && <p className="text-white/50 text-sm mt-0.5">{scoreBits.join(" · ")}</p>}
        </div>
        <span className="text-white/30 text-xl shrink-0">›</span>
      </button>
      {canQuickScore && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/scorer/${match.id}?score=1`);
          }}
          className="shrink-0 rounded-lg border border-gold/40 text-gold text-xs font-display uppercase font-bold px-3 py-2"
        >
          Set score
        </button>
      )}
    </motion.div>
  );
}

function ScorerContent() {
  const snapshot = useCompassStore((s) => s.snapshot)!;

  if (snapshot.tournament.status === "setup") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-4xl mb-3">🧭</p>
          <h1 className="font-display text-xl uppercase mb-3">Tournament not started yet</h1>
          <Link href="/setup" className="rounded-xl bg-gold text-court-bg font-display uppercase font-bold px-6 py-3 inline-block">
            Go to setup
          </Link>
        </div>
      </div>
    );
  }

  const courtLabelOf = (m: MatchDTO) => (m.courtId ? `Court ${m.courtId}${m.courtSlot === "next" ? " · Up Next" : ""}` : undefined);

  const live = snapshot.matches.filter((m) => m.status === "in_progress");
  const onCourt = snapshot.matches.filter((m) => m.status === "scheduled" && m.courtSlot === "current");
  const nextUp = snapshot.matches.filter((m) => m.courtSlot === "next");
  const readyQueue = snapshot.matches.filter((m) => m.status === "ready" && !m.courtId);
  // All of them (not capped) — coaches need to reach any past result to fix a mistake.
  const completedMatches = snapshot.matches
    .filter((m) => m.status === "completed")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  return (
    <main className="min-h-screen p-4 pb-20 max-w-lg mx-auto">
      <header className="flex items-center justify-between mb-5 sticky top-0 bg-court-bg/95 backdrop-blur py-3 -mx-4 px-4 z-10 border-b border-court-line">
        <div className="flex items-center gap-3">
          <ClubMark size={34} />
          <div>
            <p className="font-display uppercase tracking-[0.3em] text-gold/80 text-[10px]">Compass Draw</p>
            <h1 className="font-display text-xl uppercase font-bold leading-none">Scorer</h1>
          </div>
        </div>
        <PinBar />
      </header>

      <div className="flex items-center justify-between mb-4">
        <p className="text-white/40 text-xs">
          {snapshot.progress.completed} of {snapshot.progress.total} matches complete
        </p>
        <Link href="/standings" className="text-xs text-gold underline underline-offset-4 font-display uppercase font-bold">
          Standings ›
        </Link>
      </div>

      {live.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display uppercase text-sm text-white/50 mb-2">Live now</h2>
          <div className="flex flex-col gap-2">
            {live.map((m) => (
              <MatchRow key={m.id} match={m} courtLabel={courtLabelOf(m)} />
            ))}
          </div>
        </section>
      )}

      {onCourt.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display uppercase text-sm text-white/50 mb-2">On court, ready to start</h2>
          <div className="flex flex-col gap-2">
            {onCourt.map((m) => (
              <MatchRow key={m.id} match={m} courtLabel={courtLabelOf(m)} />
            ))}
          </div>
        </section>
      )}

      {nextUp.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display uppercase text-sm text-white/50 mb-2">Up next per court</h2>
          <div className="flex flex-col gap-2">
            {nextUp.map((m) => (
              <MatchRow key={m.id} match={m} courtLabel={courtLabelOf(m)} />
            ))}
          </div>
        </section>
      )}

      {readyQueue.length > 0 && (
        <section className="mb-6">
          <h2 className="font-display uppercase text-sm text-white/50 mb-2">Waiting for a court</h2>
          <div className="flex flex-col gap-2">
            {readyQueue.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {completedMatches.length > 0 && (
        <section>
          <h2 className="font-display uppercase text-sm text-white/50 mb-2">
            Completed ({completedMatches.length}) — tap to fix a mistake
          </h2>
          <div className="flex flex-col gap-2 opacity-80">
            {completedMatches.map((m) => (
              <MatchRow key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

export default function ScorerPage() {
  return (
    <ConnectionGate>
      <ScorerContent />
    </ConnectionGate>
  );
}
