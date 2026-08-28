"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import V2Gate from "@/components/v2/V2Gate";
import PinBar from "@/components/scorer/PinBar";
import ClubLogo from "@/components/shared/ClubLogo";
import { useV2Store } from "@/store/useV2Store";
import { useCoachStore } from "@/store/useCoachStore";
import { currentOnCourt } from "@/lib/v2/stage";

function CourtPicker() {
  const router = useRouter();
  const snapshot = useV2Store((s) => s.snapshot)!;
  const courtId = useCoachStore((s) => s.courtId);
  const setCourt = useCoachStore((s) => s.setCourt);
  const name = useCoachStore((s) => s.name);
  const setName = useCoachStore((s) => s.setName);

  // A coach who already chose their court goes straight back to it.
  useEffect(() => {
    if (courtId !== null && snapshot.courts.some((c) => c.id === courtId)) {
      router.replace(`/v2/coach/${courtId}`);
    }
  }, [courtId, snapshot.courts, router]);

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-16">
      <header className="flex items-center justify-between py-3 mb-5">
        <div className="flex items-center gap-3">
          <ClubLogo size={36} stacked={false} />
          <div>
            <p className="font-display uppercase tracking-[0.3em] text-gold/80 text-[10px]">Compass v2</p>
            <h1 className="font-display text-xl uppercase font-bold leading-none">Coach</h1>
          </div>
        </div>
        <PinBar />
      </header>

      <label className="block mb-6">
        <span className="font-display uppercase text-xs text-white/50">Your name (optional)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Coach Sami"
          className="mt-2 w-full bg-court-panel2 border border-court-line rounded-xl px-4 py-3 outline-none focus:ring-2 ring-gold/50"
        />
      </label>

      <h2 className="font-display uppercase text-sm text-white/50 mb-2">Pick your court</h2>
      <div className="flex flex-col gap-3">
        {snapshot.courts.map((court) => {
          const match = currentOnCourt(snapshot.matches, court.id);
          const stage = snapshot.v2.courts.find((c) => c.courtId === court.id);
          const onAir = stage?.stage === "live";
          return (
            <button
              key={court.id}
              onClick={() => {
                setCourt(court.id);
                router.push(`/v2/coach/${court.id}`);
              }}
              className="rounded-2xl border border-court-line bg-court-panel p-5 text-left active:border-gold/60"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-display uppercase font-bold text-xl">{court.label}</span>
                {onAir && (
                  <span className="flex items-center gap-1.5 text-[10px] uppercase text-live font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" /> On air
                  </span>
                )}
              </div>
              <p className="text-white/50 text-sm truncate">
                {match ? `${match.player1?.name ?? "TBD"} vs ${match.player2?.name ?? "TBD"}` : "No match scheduled yet"}
              </p>
              {stage?.coachName && <p className="text-white/30 text-xs mt-1">Last used by {stage.coachName}</p>}
            </button>
          );
        })}
        {snapshot.courts.length === 0 && (
          <p className="text-white/40 text-sm">No courts are configured for this tournament yet.</p>
        )}
      </div>

      <div className="flex items-center gap-4 justify-center mt-8">
        <Link href="/v2" className="text-white/40 text-sm underline underline-offset-4">
          v2 hub
        </Link>
        <span className="text-white/15">·</span>
        <Link href="/v2/ceremony" className="text-white/40 text-sm underline underline-offset-4">
          Awards presentation
        </Link>
      </div>
    </main>
  );
}

export default function CoachPickerPage() {
  return (
    <V2Gate>
      <CourtPicker />
    </V2Gate>
  );
}
