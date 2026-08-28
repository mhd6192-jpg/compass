"use client";

import { useState } from "react";
import Link from "next/link";
import ConnectionGate from "@/components/shared/ConnectionGate";
import ClubLogo from "@/components/shared/ClubLogo";
import { useCompassStore } from "@/store/useCompassStore";
import { usePinStore } from "@/store/usePinStore";
import { TV_SCENES } from "@/lib/scenes";

function ControlContent() {
  const tvControl = useCompassStore((s) => s.tvControl);
  const snapshot = useCompassStore((s) => s.snapshot)!;
  const pin = usePinStore((s) => s.pin);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mode = tvControl?.mode ?? "auto";
  const activeSceneId = tvControl?.sceneId ?? TV_SCENES[0].id;

  async function send(payload: { mode?: "auto" | "pinned"; sceneId?: string }) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/tv-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, pin }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  const activeIndex = Math.max(0, TV_SCENES.findIndex((s) => s.id === activeSceneId));
  const prev = () => send({ mode: "pinned", sceneId: TV_SCENES[(activeIndex - 1 + TV_SCENES.length) % TV_SCENES.length].id });
  const next = () => send({ mode: "pinned", sceneId: TV_SCENES[(activeIndex + 1) % TV_SCENES.length].id });
  const isRoundRobin = snapshot.tournament.format === "round-robin";

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-16">
      <header className="flex items-center justify-between mb-6 py-2">
        <div className="flex items-center gap-3">
          <ClubLogo size={36} stacked={false} />
          <div>
            <p className="font-display uppercase tracking-[0.3em] text-gold/80 text-[10px]">TV Control</p>
            <h1 className="font-display text-xl uppercase font-bold leading-none">Big Screen</h1>
          </div>
        </div>
        <Link href="/scorer" className="text-xs text-white/40 underline underline-offset-4">
          Scorer →
        </Link>
      </header>

      {error && <p className="text-live text-sm text-center mb-3">{error}</p>}

      {isRoundRobin && (
        <p className="text-white/40 text-xs text-center mb-6 -mt-2">
          The TV shows the live standings for round-robin tournaments — scene switching below has no effect.
        </p>
      )}

      {/* mode toggle */}
      <section className={`mb-6 ${isRoundRobin ? "opacity-40 pointer-events-none" : ""}`}>
        <h2 className="font-display uppercase text-sm text-white/50 mb-2">Mode</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => send({ mode: "auto" })}
            disabled={busy}
            className={`rounded-xl py-4 font-display uppercase border ${
              mode === "auto" ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/60"
            }`}
          >
            ▶ Auto rotate
          </button>
          <button
            onClick={() => send({ mode: "pinned", sceneId: activeSceneId })}
            disabled={busy}
            className={`rounded-xl py-4 font-display uppercase border ${
              mode === "pinned" ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/60"
            }`}
          >
            ⏸ Hold scene
          </button>
        </div>
        <p className="text-white/40 text-xs mt-2 text-center">
          {mode === "auto" ? "TV cycles through all scenes automatically." : "TV is holding on the selected scene."}
        </p>
      </section>

      {/* prev / next */}
      <section className={`mb-6 ${isRoundRobin ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="flex gap-2">
          <button onClick={prev} disabled={busy} className="flex-1 rounded-xl py-4 border border-court-line font-display uppercase text-lg">
            ‹ Prev
          </button>
          <button onClick={next} disabled={busy} className="flex-1 rounded-xl py-4 border border-court-line font-display uppercase text-lg">
            Next ›
          </button>
        </div>
      </section>

      {/* scene picker */}
      <section className={isRoundRobin ? "opacity-40 pointer-events-none" : ""}>
        <h2 className="font-display uppercase text-sm text-white/50 mb-2">Jump to scene</h2>
        <div className="flex flex-col gap-2">
          {TV_SCENES.map((s) => {
            const isActive = s.id === activeSceneId;
            const isHeld = isActive && mode === "pinned";
            return (
              <button
                key={s.id}
                onClick={() => send({ mode: "pinned", sceneId: s.id })}
                disabled={busy}
                className={`flex items-center justify-between rounded-xl px-4 py-4 border text-left ${
                  isActive ? "border-gold bg-gold/10" : "border-court-line"
                }`}
              >
                <span className="font-display uppercase text-sm">{s.label}</span>
                <span className="text-xs uppercase tracking-widest text-gold/70">
                  {isHeld ? "● held" : isActive ? "on air" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="text-white/30 text-xs text-center mt-8">
        {snapshot.progress.completed} of {snapshot.progress.total} matches complete
      </p>
    </main>
  );
}

export default function ControlPage() {
  return (
    <ConnectionGate>
      <ControlContent />
    </ConnectionGate>
  );
}
