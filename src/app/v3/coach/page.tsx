"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import V3Gate from "@/components/v3/V3Gate";
import PinBar from "@/components/scorer/PinBar";
import ClubLogo from "@/components/shared/ClubLogo";
import { useV3Store } from "@/store/useV3Store";
import { useV3CoachStore } from "@/store/useV3CoachStore";
import { currentOnCourt } from "@/lib/v2/stage";

function CourtPicker() {
  const router = useRouter();
  const snapshot = useV3Store((s) => s.snapshot)!;
  const courtId = useV3CoachStore((s) => s.courtId);
  const setCourt = useV3CoachStore((s) => s.setCourt);
  const name = useV3CoachStore((s) => s.name);
  const setName = useV3CoachStore((s) => s.setName);

  // "Change court" arrives with ?change=1. Without it this page would bounce
  // straight back to the remembered court, which made changing court impossible.
  const changing = useSearchParams().get("change") === "1";

  // A coach who already chose their court goes straight back to it.
  useEffect(() => {
    if (changing) return;
    if (courtId !== null && snapshot.courts.some((c) => c.id === courtId)) {
      router.replace(`/v3/coach/${courtId}`);
    }
  }, [changing, courtId, snapshot.courts, router]);

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-16">
      <header className="flex items-center justify-between py-3 mb-5">
        <div className="flex items-center gap-3">
          <ClubLogo size={36} stacked={false} />
          <div>
            <p className="font-display uppercase tracking-[0.3em] text-gold/80 text-[10px]">Compass v3</p>
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

      <h2 className="font-display uppercase text-sm text-white/50 mb-2">
        {changing && courtId !== null ? "Move to a different court" : "Pick your court"}
      </h2>
      <div className="flex flex-col gap-3">
        {snapshot.courts.map((court) => {
          const match = currentOnCourt(snapshot.matches, court.id);
          const stage = snapshot.v2.courts.find((c) => c.courtId === court.id);
          const onAir = stage?.stage === "live";
          const isMine = courtId === court.id;
          return (
            <button
              key={court.id}
              onClick={() => {
                setCourt(court.id);
                router.push(`/v3/coach/${court.id}`);
              }}
              className={`rounded-2xl border bg-court-panel p-5 text-left active:border-gold/60 ${
                isMine ? "border-gold/60" : "border-court-line"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-display uppercase font-bold text-xl">
                  {court.label}
                  {isMine && <span className="ml-2 text-gold/70 text-xs uppercase tracking-widest">current</span>}
                </span>
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
        <Link href="/v3" className="text-white/40 text-sm underline underline-offset-4">
          v2 hub
        </Link>
        <span className="text-white/15">·</span>
        <Link href="/v3/ceremony" className="text-white/40 text-sm underline underline-offset-4">
          Awards presentation
        </Link>
      </div>
    </main>
  );
}

export default function CoachPickerPage() {
  return (
    <V3Gate>
      <CourtPicker />
    </V3Gate>
  );
}
