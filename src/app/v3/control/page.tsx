"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import V3Gate from "@/components/v3/V3Gate";
import SwapMatchSheet from "@/components/v3/SwapMatchSheet";
import BracketBadge from "@/components/shared/BracketBadge";
import ClubLogo from "@/components/shared/ClubLogo";
import { useNow } from "@/components/v3/useNow";
import { useV3Store } from "@/store/useV3Store";
import { usePinStore } from "@/store/usePinStore";
import PinBar from "@/components/scorer/PinBar";
import { buildVenueView, formatDuration, scoreLine, type CourtCard } from "@/lib/v3/venue";
import { canSwapOut } from "@/lib/v3/swap";
import { postWithRetry } from "@/lib/v3/retry";
import type { MatchDTO } from "@/lib/types";

function Teams({ match, live }: { match: MatchDTO; live: boolean }) {
  const score = scoreLine(match);
  return (
    <div className="flex flex-col gap-1">
      {([1, 2] as const).map((slot) => {
        const player = slot === 1 ? match.player1 : match.player2;
        const value = slot === 1 ? score.a : score.b;
        const winning = match.winnerId && player?.id === match.winnerId;
        return (
          <div key={slot} className="flex items-baseline gap-2">
            <span className={`flex-1 min-w-0 truncate font-display uppercase ${winning ? "text-gold" : "text-white/85"}`}>
              {player?.name ?? "TBD"}
            </span>
            <span className={`font-display tabular-nums shrink-0 ${live ? "text-gold" : "text-white/50"}`}>{value}</span>
          </div>
        );
      })}
    </div>
  );
}

function CourtPanel({ card, onSwap }: { card: CourtCard; onSwap: () => void }) {
  const { match } = card;

  return (
    <motion.div
      layout
      className={`rounded-2xl border bg-court-panel p-4 flex flex-col gap-3 ${
        card.alert?.level === "warn" ? "border-gold/60" : card.onAir ? "border-live/40" : "border-court-line"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display uppercase font-bold text-lg">{card.label}</span>
        <div className="flex items-center gap-2 shrink-0">
          {card.onAir && (
            <span className="flex items-center gap-1.5 text-[10px] uppercase text-live font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" /> On air
            </span>
          )}
          {card.screen === "winner" && (
            <span className="text-[10px] uppercase text-gold font-bold">🏅 Celebrating</span>
          )}
          {card.elapsedMs !== null && (
            <span className="text-white/35 text-[11px] tabular-nums">{formatDuration(card.elapsedMs)}</span>
          )}
        </div>
      </div>

      {match ? (
        <>
          <BracketBadge bracket={match.bracket} roundName={match.roundName} size="sm" />
          <Teams match={match} live={card.onAir} />
        </>
      ) : (
        <p className="text-white/35 text-sm py-2">No match on this court</p>
      )}

      {card.alert && (
        <p
          className={`text-xs rounded-lg px-2.5 py-1.5 ${
            card.alert.level === "warn" ? "bg-gold/15 text-gold" : "bg-white/5 text-white/50"
          }`}
        >
          {card.alert.text}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 text-[11px] text-white/35">
        <span className="truncate">
          {card.coachName ? `Coach: ${card.coachName}` : "No coach signed in"}
        </span>
        {card.upcoming && (
          <span className="truncate shrink-0">
            Then: {card.upcoming.player1?.name ?? "TBD"} v {card.upcoming.player2?.name ?? "TBD"}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Link
          href={`/v3/tv/${card.courtId}`}
          className="flex-1 text-center rounded-xl border border-court-line font-display uppercase text-xs py-2 text-white/60"
        >
          📺 TV
        </Link>
        <Link
          href={`/v3/coach/${card.courtId}`}
          className="flex-1 text-center rounded-xl border border-court-line font-display uppercase text-xs py-2 text-white/60"
        >
          📱 Console
        </Link>
        {canSwapOut(match) && (
          <button
            onClick={onSwap}
            className="flex-1 rounded-xl border border-court-line font-display uppercase text-xs py-2 text-white/60"
          >
            ⇄ Change
          </button>
        )}
      </div>
    </motion.div>
  );
}

function ControlRoom() {
  const snapshot = useV3Store((s) => s.snapshot)!;
  const pin = usePinStore((s) => s.pin);
  const now = useNow();
  const venue = buildVenueView(snapshot, now ?? 0);

  const [swapFor, setSwapFor] = useState<CourtCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapRetrying, setSwapRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pct = venue.progress.total ? Math.round((venue.progress.completed / venue.progress.total) * 100) : 0;

  async function swapIn(matchId: string, courtId: number) {
    setError(null);
    setBusy(true);
    setSwapRetrying(false);
    const out = await postWithRetry(
      `/api/matches/${matchId}/court`,
      { courtId, slot: "current", pin },
      () => setSwapRetrying(true)
    );
    setBusy(false);
    setSwapRetrying(false);

    if (out.kind === "offline") {
      setError("No connection — nothing on the courts has changed. Try again in a moment.");
      return;
    }
    if (out.kind === "rejected") {
      setError(out.error);
      return;
    }
    setSwapFor(null);
    useV3Store.getState().refresh();
  }

  return (
    <main className="min-h-screen flex flex-col gap-4 p-4 max-w-3xl mx-auto w-full">
      <header className="flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-3 min-w-0">
          <ClubLogo size={36} />
          <div className="min-w-0">
            <p className="font-display uppercase tracking-[0.3em] text-gold/70 text-[10px]">Control room</p>
            <h1 className="font-display uppercase font-bold text-xl truncate">Whole venue</h1>
          </div>
        </div>
        <Link href="/v3" className="text-white/35 text-xs underline underline-offset-4 shrink-0">
          v2 hub
        </Link>
      </header>

      <PinBar />
      {error && <p className="text-sm text-red-300">{error}</p>}

      {/* progress */}
      <div className="rounded-2xl border border-court-line bg-court-panel p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-display uppercase text-sm text-white/60">Event progress</span>
          <span className="font-display tabular-nums text-gold">
            {venue.progress.completed} / {venue.progress.total}
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full bg-gold rounded-full"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
        {venue.alertCount > 0 && (
          <p className="text-gold text-xs mt-2">
            {venue.alertCount} court{venue.alertCount === 1 ? " needs" : "s need"} attention
          </p>
        )}
      </div>

      {/* courts */}
      <section className="flex flex-col gap-3">
        {venue.courts.map((card) => (
          <CourtPanel key={card.courtId} card={card} onSwap={() => setSwapFor(card)} />
        ))}
        {venue.courts.length === 0 && (
          <p className="text-white/40 text-sm">No courts configured — seed the tournament in setup.</p>
        )}
      </section>

      {/* the pool nobody has been called from yet */}
      <section className="rounded-2xl border border-court-line bg-court-panel p-4">
        <h2 className="font-display uppercase text-sm text-white/60 mb-2">
          Waiting to be called <span className="text-white/30">({venue.queue.length})</span>
        </h2>
        {venue.queue.length === 0 ? (
          <p className="text-white/35 text-sm">Nothing waiting — every playable match is on a court.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {venue.queue.slice(0, 8).map((m) => (
              <p key={m.id} className="text-white/60 text-sm truncate">
                <span className="text-white/25 font-display uppercase text-[10px] mr-2">{m.roundName}</span>
                {m.player1?.name ?? "TBD"} v {m.player2?.name ?? "TBD"}
              </p>
            ))}
            {venue.queue.length > 8 && (
              <p className="text-white/25 text-xs">+ {venue.queue.length - 8} more</p>
            )}
          </div>
        )}
        <p className="text-white/25 text-[11px] mt-2">
          Called automatically as courts free up, resting the teams who just played.
        </p>
      </section>

      <div className="flex gap-2 pb-8">
        <Link
          href="/v3/board"
          className="flex-1 text-center rounded-2xl border border-court-line font-display uppercase text-sm py-3 text-white/70"
        >
          📊 Big board
        </Link>
        <Link
          href="/v3/ceremony"
          className={`flex-1 text-center rounded-2xl font-display uppercase text-sm py-3 ${
            venue.ceremonyRunning ? "bg-gold text-court-bg font-bold" : "border border-court-line text-white/70"
          }`}
        >
          🏆 {venue.ceremonyRunning ? "Ceremony running" : "Ceremony"}
        </Link>
      </div>

      {swapFor?.match && (
        <SwapMatchSheet
          courtId={swapFor.courtId}
          outgoing={swapFor.match}
          matches={snapshot.matches}
          busy={busy}
          retrying={swapRetrying}
          onPick={(matchId) => swapIn(matchId, swapFor.courtId)}
          onClose={() => setSwapFor(null)}
        />
      )}
    </main>
  );
}

export default function ControlRoomPage() {
  return (
    <V3Gate>
      <ControlRoom />
    </V3Gate>
  );
}
