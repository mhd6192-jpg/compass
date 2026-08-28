"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ConnectionGate from "@/components/shared/ConnectionGate";
import CourtCard from "@/components/display/CourtCard";
import SceneCarousel from "@/components/display/SceneCarousel";
import TwoGroupScene from "@/components/display/TwoGroupScene";
import RoundRobinStandings from "@/components/display/RoundRobinStandings";
import GroupChampion from "@/components/display/GroupChampion";
import ResultsTicker from "@/components/display/ResultsTicker";
import ProgressBar from "@/components/display/ProgressBar";
import QrCorner from "@/components/display/QrCorner";
import SoundToggle from "@/components/display/SoundToggle";
import ClubLogo from "@/components/shared/ClubLogo";
import CelebrationOverlay, { Celebration } from "@/components/display/CelebrationOverlay";
import { useCompassStore } from "@/store/useCompassStore";
import { useSoundStore } from "@/store/useSoundStore";
import { playTierSound } from "@/lib/sound";

function DisplayContent() {
  const snapshot = useCompassStore((s) => s.snapshot)!;
  const lastPointEvent = useCompassStore((s) => s.lastPointEvent);
  const completedEvents = useCompassStore((s) => s.completedEvents);

  const soundEnabled = useSoundStore((s) => s.enabled);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const celebratedRef = useRef<string | null>(null);

  // Fire-and-forget sound cue per point/game/set/match/champion tier. No timer state to
  // manage here, so it can't hit the stuck-overlay class of bug the celebration effect had.
  useEffect(() => {
    if (!lastPointEvent || !soundEnabled) return;
    playTierSound(lastPointEvent.tier);
  }, [lastPointEvent, soundEnabled]);

  // Detect newly-completed matches and queue a celebration. Kept separate from the
  // dismiss timer below so an unrelated point/game/set event elsewhere can't cancel
  // a pending dismissal without rescheduling it (that was leaving overlays stuck).
  useEffect(() => {
    if (!lastPointEvent) return;
    if (lastPointEvent.tier !== "match" && lastPointEvent.tier !== "champion") return;
    const evt = completedEvents.find((e) => e.matchId === lastPointEvent.matchId);
    if (!evt) return;
    const uniqueKey = `${evt.matchId}-${evt.ts}`;
    if (celebratedRef.current === uniqueKey) return;
    celebratedRef.current = uniqueKey;
    setCelebration({
      key: uniqueKey,
      tier: lastPointEvent.tier,
      bracket: evt.bracket as Celebration["bracket"],
      roundName: evt.roundName,
      winnerName: evt.winnerName,
      loserName: evt.loserName,
      scoreLine: evt.scoreLine,
    });
  }, [lastPointEvent, completedEvents]);

  // Auto-dismiss whatever celebration is currently showing. Depends only on
  // `celebration` itself so it always restarts cleanly when it changes.
  useEffect(() => {
    if (!celebration) return;
    const duration = celebration.tier === "champion" ? 7000 : 3500;
    const timer = setTimeout(() => setCelebration(null), duration);
    return () => clearTimeout(timer);
  }, [celebration]);

  if (snapshot.tournament.status === "setup") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-5xl mb-4">🧭</p>
          <h1 className="font-display text-2xl uppercase mb-3">Waiting for the draw to be seeded</h1>
          <Link href="/setup" className="text-gold underline underline-offset-4">
            Go to setup
          </Link>
        </div>
      </div>
    );
  }

  const courts = snapshot.courts.map((court) => {
    const current = snapshot.matches.find((m) => m.courtId === court.id && m.courtSlot === "current") ?? null;
    const next = snapshot.matches.find((m) => m.courtId === court.id && m.courtSlot === "next") ?? null;
    return { id: court.id, label: court.label, current, next };
  });

  // Once the last match is in, the court cards have nothing left to say — they drop
  // out entirely so the champion and the final table get the whole screen.
  const allPlayed = snapshot.progress.total > 0 && snapshot.progress.completed === snapshot.progress.total;

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 py-3 border-b border-white/5">
        <div className="flex items-center gap-4">
          <ClubLogo size={44} />
          <div className="h-9 w-px bg-white/10 hidden sm:block" />
          <div className="hidden sm:block">
            <p className="font-display uppercase tracking-[0.35em] text-gold/80 text-[10px]">Live Event</p>
            <h1 className="font-display text-xl sm:text-2xl font-bold uppercase tracking-wide">Compass Draw</h1>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <ProgressBar completed={snapshot.progress.completed} total={snapshot.progress.total} />
          <SoundToggle />
          <QrCorner />
        </div>
      </header>

      {/* Never scrolls — this runs unattended on a TV with nobody to scroll it.
          Children use min-h-0 so they shrink to fit instead of overflowing. */}
      <main className="flex-1 min-h-0 flex flex-col gap-4 px-5 sm:px-8 pb-3 overflow-hidden">
        {!allPlayed && (
          <section className={`shrink-0 grid grid-cols-1 gap-4 ${courts.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
            {courts.map((c) => (
              <CourtCard key={c.id} courtId={c.id} label={c.label} current={c.current} next={c.next} />
            ))}
          </section>
        )}

        {snapshot.tournament.format === "two-group" ? (
          <TwoGroupScene matches={snapshot.matches} />
        ) : snapshot.tournament.format === "round-robin" ? (
          // Every match played -> the winner and the final table share the screen.
          allPlayed ? (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 sm:gap-6">
              <div className="flex min-h-0 lg:flex-1">
                <GroupChampion matches={snapshot.matches} />
              </div>
              <div className="flex min-h-0 flex-1">
                <RoundRobinStandings matches={snapshot.matches} title="Final Standings" final autoFit />
              </div>
            </div>
          ) : (
            <RoundRobinStandings matches={snapshot.matches} autoFit />
          )
        ) : (
          <SceneCarousel matches={snapshot.matches} progress={snapshot.progress} />
        )}
      </main>

      <ResultsTicker events={completedEvents} />

      <CelebrationOverlay celebration={celebration} />
    </div>
  );
}

export default function DisplayPage() {
  return (
    <ConnectionGate>
      <DisplayContent />
    </ConnectionGate>
  );
}
