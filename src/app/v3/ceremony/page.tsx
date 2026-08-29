"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import V3Gate from "@/components/v3/V3Gate";
import PinBar from "@/components/scorer/PinBar";
import ClubLogo from "@/components/shared/ClubLogo";
import { placeMedal, placeTitle } from "@/components/v3/CeremonyScreen";
import { useV3Store } from "@/store/useV3Store";
import { usePinStore } from "@/store/usePinStore";
import { currentAward } from "@/lib/v2/stage";
import { postWithRetry } from "@/lib/v3/retry";

type Action = "configure" | "start" | "next" | "back" | "reset" | "sound";

/**
 * Ceremony music lives on the court TVs, but the announcer is the only person
 * who knows whether the hall's own PA is already playing something — so the
 * switch belongs on their phone, not on each screen.
 */
function SoundRow({ soundOn, busy, onToggle }: { soundOn: boolean; busy: boolean; onToggle: (on: boolean) => void }) {
  return (
    <button
      onClick={() => onToggle(!soundOn)}
      disabled={busy}
      className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 mb-5 text-left ${
        soundOn ? "border-gold/50 bg-gold/10" : "border-court-line"
      }`}
    >
      <span className="text-2xl shrink-0">{soundOn ? "🔊" : "🔇"}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-display uppercase text-sm">Ceremony music on the TVs</span>
        <span className="block text-white/40 text-xs">
          {soundOn ? "Fanfares play on every court screen" : "Screens stay silent — use the hall PA instead"}
        </span>
      </span>
      <span className={`shrink-0 font-display uppercase text-xs ${soundOn ? "text-gold" : "text-white/35"}`}>
        {soundOn ? "On" : "Off"}
      </span>
    </button>
  );
}

function CeremonyRemote() {
  const snapshot = useV3Store((s) => s.snapshot)!;
  const pin = usePinStore((s) => s.pin);
  const ceremony = snapshot.v2.ceremony;
  const podium = snapshot.v2.podium;

  const [error, setError] = useState<string | null>(null);
  const [pinInvalid, setPinInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [peek, setPeek] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);

  // Seed the selection from whatever is already saved, falling back to the
  // usual three medals — trimmed to the places this tournament actually has.
  useEffect(() => {
    setSelected((cur) => {
      if (cur.length) return cur;
      if (ceremony.places.length) return [...ceremony.places];
      return podium.filter((a) => a.place <= 3).map((a) => a.place);
    });
  }, [ceremony.places, podium]);

  // Hide the peek again every time the presentation moves on.
  useEffect(() => {
    setPeek(false);
  }, [ceremony.stage, ceremony.cursor]);

  /**
   * Sends one ceremony command, retrying briefly on a flaky connection.
   *
   * Deliberately NOT the durable queue the coach console uses for points. A
   * point is a fact that happened and must be recorded whenever it can be; a
   * ceremony tap is an instruction to change what is on the TVs *now*. Replaying
   * "reveal the champion" from a queue two minutes later would fire it at a
   * moment nobody chose, and the screens cannot see it during the outage anyway.
   * So it retries for as long as the announcer is plausibly still standing there
   * waiting, then stops and says so.
   *
   * Advancing carries the rev the phone last saw, so a reply lost on the way
   * back cannot turn one tap into two steps and skip an award.
   */
  async function send(action: Action, places?: number[], soundOn?: boolean) {
    setError(null);
    setBusy(true);
    setRetrying(false);
    const expectedRev = action === "next" || action === "back" ? ceremony.rev : undefined;

    const out = await postWithRetry(
      "/api/v2/ceremony",
      { action, places, soundOn, pin, expectedRev },
      () => setRetrying(true)
    );
    setBusy(false);
    setRetrying(false);

    if (out.kind === "offline") {
      setError("No connection — the screens did not change. Check the wifi and tap again.");
      return;
    }
    if (out.kind === "rejected") {
      if (out.status === 401) setPinInvalid(true);
      setError(out.error);
      return;
    }
    // `applied: false` means an earlier attempt had already landed; the screens
    // are where they should be, so this is a success, not a miss.
    useV3Store.getState().refresh();
  }

  const allPlayed = snapshot.progress.total > 0 && snapshot.progress.completed === snapshot.progress.total;
  const remaining = snapshot.progress.total - snapshot.progress.completed;
  const revealOrder = [...selected].sort((a, b) => b - a);

  const active = currentAward(ceremony);
  const nextIndex = ceremony.stage === "standby" ? 0 : ceremony.cursor + 1;
  const nextPlace = ceremony.places[nextIndex];
  const nextAward = nextPlace !== undefined ? ceremony.awards.find((a) => a.place === nextPlace) : undefined;

  const header = (
    <header className="flex items-center justify-between gap-3 py-3 mb-4 sticky top-0 bg-court-bg/95 backdrop-blur z-20 border-b border-court-line -mx-4 px-4">
      <div className="flex items-center gap-3 min-w-0">
        <ClubLogo size={32} stacked={false} />
        <div className="min-w-0">
          <p className="font-display uppercase tracking-[0.3em] text-gold/80 text-[10px]">Compass v3</p>
          <h1 className="font-display text-xl uppercase font-bold leading-none">Awards</h1>
        </div>
      </div>
      <PinBar invalid={pinInvalid} onDismissInvalid={() => setPinInvalid(false)} />
    </header>
  );

  // ---------------------------------------------------------------- idle ---
  if (ceremony.stage === "idle") {
    return (
      <main className="min-h-screen p-4 max-w-lg mx-auto pb-16">
        {header}
        {error && <p className="text-live text-sm text-center mb-3">{error}</p>}

        {!allPlayed && (
          <div className="rounded-2xl border border-south/40 bg-south/10 p-4 mb-5">
            <p className="font-display uppercase text-sm text-south mb-1">
              {remaining} {remaining === 1 ? "match" : "matches"} still to play
            </p>
            <p className="text-white/55 text-xs">
              You can still announce now — the podium is frozen the moment you start, using the standings as they are.
            </p>
          </div>
        )}

        <h2 className="font-display uppercase text-sm text-white/50 mb-2">Who are you announcing?</h2>
        <p className="text-white/40 text-xs mb-3">
          Leave a place out if you have no medal for it — the presentation simply skips it.
        </p>

        <div className="flex flex-col gap-2 mb-4">
          {podium.map((entry) => {
            const on = selected.includes(entry.place);
            return (
              <button
                key={entry.place}
                onClick={() => setSelected((cur) => (on ? cur.filter((p) => p !== entry.place) : [...cur, entry.place]))}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left ${
                  on ? "border-gold bg-gold/10" : "border-court-line opacity-60"
                }`}
              >
                <span className="text-2xl shrink-0">{placeMedal(entry.place)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-display uppercase text-sm text-white/60">{placeTitle(entry.place)}</span>
                  <span className="block font-display font-bold uppercase truncate">{entry.name}</span>
                  <span className="block text-white/35 text-xs truncate">{entry.detail}</span>
                </span>
                <span className={`shrink-0 text-lg ${on ? "text-gold" : "text-white/20"}`}>{on ? "✓" : "○"}</span>
              </button>
            );
          })}
          {podium.length === 0 && <p className="text-white/40 text-sm">No results to announce yet.</p>}
        </div>

        {revealOrder.length > 0 && (
          <p className="text-white/45 text-xs mb-4 text-center">
            Reveal order:{" "}
            <span className="text-gold font-display uppercase">
              {revealOrder.map((p) => placeTitle(p)).join(" → ")}
            </span>
          </p>
        )}

        <SoundRow soundOn={ceremony.soundOn} busy={busy} onToggle={(on) => send("sound", undefined, on)} />


        <button
          onClick={async () => {
            await send("configure", revealOrder);
            await send("start");
          }}
          disabled={busy || revealOrder.length === 0}
          className="w-full rounded-2xl bg-gold text-court-bg font-display uppercase font-bold text-xl py-6 disabled:opacity-40"
        >
          Announce results
        </button>
        <p className="text-white/35 text-xs text-center mt-3">
          Every court screen switches to the presentation. Nothing is revealed until you tap again.
        </p>

        <div className="flex items-center justify-center gap-4 mt-8">
          <Link href="/v3" className="text-white/35 text-xs underline underline-offset-4">
            v2 hub
          </Link>
          <span className="text-white/15">·</span>
          <Link href="/v3/coach" className="text-white/35 text-xs underline underline-offset-4">
            Coach console
          </Link>
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------ running ---
  const done = ceremony.stage === "complete";

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto flex flex-col pb-10">
      {header}
      {error && <p className="text-live text-sm text-center mb-3">{error}</p>}

      <div className="rounded-2xl border border-court-line bg-court-panel p-4 mb-4">
        <p className="font-display uppercase text-[10px] tracking-[0.3em] text-gold/70 mb-2">On the screens now</p>
        {ceremony.stage === "standby" && <p className="font-display uppercase text-lg">Holding card — players to centre court</p>}
        {active && (
          <div className="flex items-center gap-3">
            <span className="text-3xl">{placeMedal(active.place)}</span>
            <div className="min-w-0">
              <p className="font-display uppercase text-xs text-white/50">{placeTitle(active.place)}</p>
              <p className="font-display font-bold uppercase text-xl truncate">{active.name}</p>
            </div>
          </div>
        )}
        {done && <p className="font-display uppercase text-lg text-gold">Full podium · celebration</p>}
      </div>

      {/* the running order, so the announcer always knows where they are */}
      <div className="flex flex-col gap-1.5 mb-5">
        {ceremony.places.map((place, i) => {
          const state = done || i <= ceremony.cursor ? "done" : i === ceremony.cursor + 1 ? "next" : "todo";
          return (
            <div
              key={place}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                state === "next" ? "border-gold bg-gold/10" : "border-court-line opacity-60"
              }`}
            >
              <span className="text-lg">{placeMedal(place)}</span>
              <span className="flex-1 font-display uppercase text-sm">{placeTitle(place)}</span>
              <span className="text-[10px] uppercase tracking-widest text-white/40">
                {state === "done" ? "announced" : state === "next" ? "next" : "waiting"}
              </span>
            </div>
          );
        })}
      </div>

      {!done && nextAward && (
        <div className="mb-4">
          {peek ? (
            <p className="text-center text-sm">
              <span className="text-white/45">Next up:</span>{" "}
              <span className="font-display font-bold uppercase text-gold">{nextAward.name}</span>
            </p>
          ) : (
            <button onClick={() => setPeek(true)} className="w-full text-center text-white/40 text-xs underline underline-offset-4 py-2">
              Peek at the next name (stays off the TV)
            </button>
          )}
        </div>
      )}

      <SoundRow soundOn={ceremony.soundOn} busy={busy} onToggle={(on) => send("sound", undefined, on)} />

      <div className="flex-1" />

      {!done ? (
        <button
          onClick={() => send("next")}
          disabled={busy}
          className="w-full rounded-2xl bg-gold text-court-bg font-display uppercase font-bold text-xl py-7 disabled:opacity-40"
        >
          {retrying
            ? "Reconnecting…"
            : nextPlace !== undefined
              ? `Announce ${placeTitle(nextPlace).toLowerCase()}`
              : "Show the full podium"}
        </button>
      ) : (
        <button
          onClick={() => send("reset")}
          disabled={busy}
          className="w-full rounded-2xl bg-gold text-court-bg font-display uppercase font-bold text-xl py-7 disabled:opacity-40"
        >
          Close · return screens to the courts
        </button>
      )}

      <div className="grid grid-cols-2 gap-2 mt-3">
        <button
          onClick={() => send("back")}
          disabled={busy || ceremony.stage === "standby"}
          className="rounded-xl border border-court-line py-3 font-display uppercase text-sm text-white/70 disabled:opacity-30"
        >
          ‹ Step back
        </button>
        <button
          onClick={() => send("reset")}
          disabled={busy}
          className="rounded-xl border border-court-line py-3 font-display uppercase text-sm text-white/70"
        >
          Cancel presentation
        </button>
      </div>
    </main>
  );
}

export default function CeremonyPage() {
  return (
    <V3Gate>
      <CeremonyRemote />
    </V3Gate>
  );
}
