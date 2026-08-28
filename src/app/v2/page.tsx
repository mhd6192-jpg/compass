"use client";

import Link from "next/link";
import V2Gate from "@/components/v2/V2Gate";
import ClubLogo from "@/components/shared/ClubLogo";
import { useV2Store } from "@/store/useV2Store";
import { currentOnCourt } from "@/lib/v2/stage";

function Hub() {
  const snapshot = useV2Store((s) => s.snapshot)!;
  const ceremonyRunning = snapshot.v2.ceremony.stage !== "idle";

  return (
    <main className="min-h-screen flex flex-col items-center p-6 gap-8">
      <div className="text-center flex flex-col items-center gap-3 mt-6">
        <ClubLogo size={52} />
        <div>
          <p className="font-display uppercase tracking-[0.35em] text-gold/80 text-xs mb-1">Compass v2</p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold uppercase tracking-tight">Court Screens</h1>
        </div>
        <p className="text-white/45 text-sm max-w-md">
          One TV per court, one coach per court, and a results presentation the announcer drives from their phone.
        </p>
      </div>

      <section className="w-full max-w-3xl">
        <h2 className="font-display uppercase text-sm text-white/50 mb-2">Court screens (open one per TV)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {snapshot.courts.map((court) => {
            const stage = snapshot.v2.courts.find((c) => c.courtId === court.id);
            const match = currentOnCourt(snapshot.matches, court.id);
            return (
              <div key={court.id} className="rounded-2xl border border-court-line bg-court-panel p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display uppercase font-bold text-xl">{court.label}</span>
                  {stage?.stage === "live" && (
                    <span className="flex items-center gap-1.5 text-[10px] uppercase text-live font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" /> On air
                    </span>
                  )}
                </div>
                <p className="text-white/45 text-sm truncate mb-3">
                  {match ? `${match.player1?.name ?? "TBD"} vs ${match.player2?.name ?? "TBD"}` : "No match scheduled"}
                </p>
                <div className="flex gap-2">
                  <Link
                    href={`/v2/tv/${court.id}`}
                    className="flex-1 text-center rounded-xl bg-gold text-court-bg font-display uppercase font-bold text-sm py-2.5"
                  >
                    📺 TV
                  </Link>
                  <Link
                    href={`/v2/coach/${court.id}`}
                    className="flex-1 text-center rounded-xl border border-court-line font-display uppercase text-sm py-2.5 text-white/70"
                  >
                    📱 Coach
                  </Link>
                </div>
              </div>
            );
          })}
          {snapshot.courts.length === 0 && (
            <p className="text-white/40 text-sm">
              No courts configured yet — seed the tournament in{" "}
              <Link href="/setup" className="text-gold underline underline-offset-4">
                setup
              </Link>
              .
            </p>
          )}
        </div>
      </section>

      <section className="w-full max-w-3xl">
        <h2 className="font-display uppercase text-sm text-white/50 mb-2">Whole venue</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link href="/v2/control" className="rounded-2xl border border-court-line bg-court-panel p-5 flex items-center gap-4">
            <span className="text-3xl">🎛️</span>
            <div className="flex-1 min-w-0">
              <p className="font-display uppercase font-bold text-lg">Control room</p>
              <p className="text-white/45 text-sm">Every court on one phone — scores, coaches, what needs attention</p>
            </div>
          </Link>
          <Link href="/v2/board" className="rounded-2xl border border-court-line bg-court-panel p-5 flex items-center gap-4">
            <span className="text-3xl">📊</span>
            <div className="flex-1 min-w-0">
              <p className="font-display uppercase font-bold text-lg">Big board</p>
              <p className="text-white/45 text-sm">For the lobby TV — all courts live, standings, what is coming up</p>
            </div>
          </Link>
          <Link href="/v2/player" className="rounded-2xl border border-court-line bg-court-panel p-5 flex items-center gap-4">
            <span className="text-3xl">🎾</span>
            <div className="flex-1 min-w-0">
              <p className="font-display uppercase font-bold text-lg">Player card</p>
              <p className="text-white/45 text-sm">What players see when they scan the board — no PIN, read only</p>
            </div>
          </Link>
        </div>
      </section>

      <section className="w-full max-w-3xl">
        <h2 className="font-display uppercase text-sm text-white/50 mb-2">Presentation</h2>
        <Link
          href="/v2/ceremony"
          className={`block rounded-2xl border p-5 ${ceremonyRunning ? "border-gold bg-gold/10" : "border-court-line bg-court-panel"}`}
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl">🏆</span>
            <div className="flex-1 min-w-0">
              <p className="font-display uppercase font-bold text-lg">Announce the results</p>
              <p className="text-white/45 text-sm">
                {ceremonyRunning
                  ? "Running now — the presentation is on every court screen"
                  : "Pick which places to announce, then reveal them one tap at a time"}
              </p>
            </div>
            <span className="text-white/30 text-xl">›</span>
          </div>
        </Link>
      </section>

      <div className="flex items-center gap-4 flex-wrap justify-center mt-2 mb-8">
        <Link href="/" className="text-white/35 text-sm underline underline-offset-4">
          Back to v1 control
        </Link>
        <span className="text-white/15">·</span>
        <Link href="/setup" className="text-white/35 text-sm underline underline-offset-4">
          Setup
        </Link>
        <span className="text-white/15">·</span>
        <Link href="/standings" className="text-white/35 text-sm underline underline-offset-4">
          Standings
        </Link>
      </div>
    </main>
  );
}

export default function V2HubPage() {
  return (
    <V2Gate>
      <Hub />
    </V2Gate>
  );
}
