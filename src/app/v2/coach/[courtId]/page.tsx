"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { serveInfo } from "@/lib/scoring/serve";
import { ServeBadge, ServeHandover, useServeHandover } from "@/components/v2/ServeIndicator";
import SwapMatchSheet from "@/components/v2/SwapMatchSheet";
import { canSwapOut } from "@/lib/v2/swap";
import { postWithRetry } from "@/lib/v2/retry";
import { useOutbox } from "@/components/v2/useOutbox";
import { enqueue as enqueuePoint, clearMatch as clearOutboxMatch, pendingFor, popLast, queuedFor } from "@/lib/v2/outbox";
import V2Gate from "@/components/v2/V2Gate";
import PinBar from "@/components/scorer/PinBar";
import BracketBadge from "@/components/shared/BracketBadge";
import { ClubMark } from "@/components/shared/ClubLogo";
import { useV2Store } from "@/store/useV2Store";
import { useCoachStore } from "@/store/useCoachStore";
import { usePinStore } from "@/store/usePinStore";
import { applyPoint, stateFromDTO, toDTO } from "@/lib/scoring/engine";
import { formatMatchScoreLine } from "@/lib/scoring/format";
import { MatchDTO, TiebreakMode } from "@/lib/types";
import { currentOnCourt, emptyCourtStage, nextOnCourt, resolveCourtScreen } from "@/lib/v2/stage";

/**
 * Must stay OUTSIDE `ScorePad`. Declared inside, React sees a brand-new
 * component type on every render, unmounts both tap zones and mounts fresh
 * ones — which replayed the score's pop-in animation on every 800ms poll and
 * made the numbers look like they were permanently twitching.
 */
function TapSide({
  match,
  slot,
  onTap,
  disabled,
  serve,
}: {
  match: MatchDTO;
  slot: 1 | 2;
  onTap: (slot: 1 | 2) => void;
  disabled: boolean;
  serve: ReturnType<typeof serveInfo>;
}) {
  const st = match.state;
  const i = slot - 1;
  const player = slot === 1 ? match.player1 : match.player2;
  const games = st.currentSet?.games[i] ?? 0;
  const points = st.currentGame?.display[i] ?? "—";

  return (
    <button
      onClick={() => onTap(slot)}
      disabled={disabled}
      className={`flex-1 min-h-0 rounded-3xl border-2 bg-court-panel active:border-gold active:bg-court-panel2 disabled:opacity-40 flex flex-col items-center justify-center gap-1 px-4 py-6 ${
        serve?.slot === slot ? "border-gold/70" : "border-court-line"
      }`}
    >
      {/* Only on the serving side, so a glance at the phone answers "who serves?"
          without counting points back. */}
      <ServeBadge serve={serve} slot={slot} size="0.6rem" ballSize={18} />
      <span className="font-display uppercase font-bold text-2xl text-center leading-tight break-words">
        {player?.name ?? "TBD"}
      </span>
      <span className="text-white/40 text-xs uppercase tracking-widest">
        Sets {st.setsWon[i]} · Games {games}
      </span>
      {/* Animates only when the displayed point actually changes — no `key` on a
          poll-varying value, so a re-render with the same score is silent. */}
      <motion.span
        key={points}
        initial={{ scale: 0.72, opacity: 0.45 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.45, duration: 0.3 }}
        className="font-display font-bold text-gold tabular-nums leading-none mt-1"
        style={{ fontSize: "clamp(3rem, 16vw, 6rem)" }}
      >
        {points}
      </motion.span>
      <span className="text-white/30 text-[11px] uppercase tracking-widest mt-1">Tap to score</span>
    </button>
  );
}

/**
 * The queue, made visible.
 *
 * A coach whose taps are piling up needs to know two things: that nothing has
 * been lost, and that they should keep going. Silence would read as the app
 * being broken, and a scary red error would make them stop scoring — which is
 * the one thing that actually loses data.
 */
function OutboxBanner({ queued, status }: { queued: number; status: string }) {
  if (queued === 0 && status !== "error") return null;

  const offline = status === "offline";
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`shrink-0 flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs ${
        offline ? "bg-gold/15 text-gold border border-gold/30" : "bg-white/5 text-white/60 border border-white/10"
      }`}
    >
      <span className={offline ? "" : "animate-pulse"}>{offline ? "📴" : "☁️"}</span>
      <span className="flex-1 min-w-0">
        {offline
          ? `No connection — ${queued} point${queued === 1 ? "" : "s"} saved on this phone. Keep scoring.`
          : `Sending ${queued} point${queued === 1 ? "" : "s"}…`}
      </span>
    </motion.div>
  );
}

function ScorePad({ match, onTap, disabled }: { match: MatchDTO; onTap: (slot: 1 | 2) => void; disabled: boolean }) {
  const serve = serveInfo(match.state);
  const handedTo = useServeHandover(serve, match.id);
  const handoverName = handedTo === 1 ? match.player1?.name : handedTo === 2 ? match.player2?.name : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 relative">
      <TapSide match={match} slot={1} onTap={onTap} disabled={disabled} serve={serve} />
      <TapSide match={match} slot={2} onTap={onTap} disabled={disabled} serve={serve} />
      {handoverName && <ServeHandover key={`serve-${handedTo}-${match.state.totalPoints}`} name={handoverName} />}
    </div>
  );
}

function CoachConsole({ courtId }: { courtId: number }) {
  const snapshot = useV2Store((s) => s.snapshot)!;
  const pin = usePinStore((s) => s.pin);
  const coachName = useCoachStore((s) => s.name);
  const setCourt = useCoachStore((s) => s.setCourt);

  const [error, setError] = useState<string | null>(null);
  const [pinInvalid, setPinInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmWin, setConfirmWin] = useState<{ slot: 1 | 2; winnerName: string } | null>(null);
  const [retireOpen, setRetireOpen] = useState(false);
  const [retireSlot, setRetireSlot] = useState<1 | 2 | null>(null);
  const [retireReason, setRetireReason] = useState("Retired");
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapRetrying, setSwapRetrying] = useState(false);
  const [courtRetrying, setCourtRetrying] = useState(false);

  // Remember this court for next time the coach opens the app.
  useEffect(() => {
    setCourt(courtId);
  }, [courtId, setCourt]);

  const court = snapshot.courts.find((c) => c.id === courtId);
  const courtLabel = court?.label ?? `Court ${courtId}`;
  const stage = snapshot.v2.courts.find((c) => c.courtId === courtId) ?? emptyCourtStage(courtId);
  const allPlayed = snapshot.progress.total > 0 && snapshot.progress.completed === snapshot.progress.total;
  const view = resolveCourtScreen({ courtId, stage, matches: snapshot.matches, allPlayed, ceremony: snapshot.v2.ceremony });

  const onCourt = currentOnCourt(snapshot.matches, courtId);
  const upNext = nextOnCourt(snapshot.matches, courtId);
  // While the TV is frozen on a winner the court has usually already been given
  // its next match, so the console follows the TV rather than the queue.
  const match = view.screen === "winner" || view.screen === "live" ? view.match : onCourt;

  const config = useMemo(
    () => ({
      bestOfSets: snapshot.tournament.bestOfSets,
      tiebreakMode: snapshot.tournament.tiebreakMode as TiebreakMode,
      raceTarget: snapshot.tournament.raceTarget || undefined,
      serveEvery: snapshot.tournament.serveEvery || undefined,
      raceWinBy: snapshot.tournament.raceWinBy || undefined,
    }),
    [snapshot.tournament.bestOfSets, snapshot.tournament.tiebreakMode, snapshot.tournament.raceTarget, snapshot.tournament.serveEvery, snapshot.tournament.raceWinBy]
  );

  const liveStateRef = useRef<{ matchId: string; state: ReturnType<typeof stateFromDTO> } | null>(null);
  useEffect(() => {
    liveStateRef.current = null;
  }, [match?.id]);

  const outbox = useOutbox({
    pin,
    onUnauthorized: () => setPinInvalid(true),
    onDesync: (matchId, message) => {
      // The server is the record. Drop the local guess and show what it says.
      liveStateRef.current = null;
      clearOutboxMatch(matchId);
      setError(`${message} The score has been reloaded from the match record — please check it.`);
      useV2Store.getState().refresh();
    },
    onAccepted: () => useV2Store.getState().refresh(),
  });
  const queued = match ? pendingFor(match.id) : 0;

  /**
   * Pull a different match onto this court's current slot.
   *
   * Retried rather than queued: placing a match is an instruction about which
   * match starts next, and firing it from a durable queue minutes later could
   * pull a court out from under whatever the coach did after giving up — not
   * least starting the original match, which scoring lets them do offline.
   * Re-sending is harmless in itself, since placing a match already on that slot
   * changes nothing.
   */
  async function swapIn(matchId: string) {
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
      setError("No connection — the match on this court has not changed. Try again in a moment.");
      return;
    }
    if (out.kind === "rejected") {
      if (out.status === 401) setPinInvalid(true);
      setError(out.error);
      return;
    }
    setSwapOpen(false);
    useV2Store.getState().refresh();
  }

  /**
   * Take the TV over, or hand it back.
   *
   * Retried rather than queued, for the same reason as the match swap: both are
   * instructions about what a screen shows now. A "finish" replayed from a
   * durable queue would drop the TV out of a celebration — or worse, off a match
   * that has since started — at a moment nobody asked for. Re-sending within the
   * retry window is safe: both actions just set the court's stage, so applying
   * one twice lands on the same state.
   */
  async function callCourt(action: "live" | "finish", matchId?: string) {
    setError(null);
    setBusy(true);
    setCourtRetrying(false);
    const out = await postWithRetry(`/api/v2/court/${courtId}`, { action, matchId, pin, coachName }, () =>
      setCourtRetrying(true)
    );
    setBusy(false);
    setCourtRetrying(false);

    if (out.kind === "offline") {
      setError(
        action === "finish"
          ? "No connection — the screen is still celebrating. Try again in a moment."
          : "No connection — the screen has not gone live yet. Keep scoring, it will catch up."
      );
      return false;
    }
    if (out.kind === "rejected") {
      if (out.status === 401) setPinInvalid(true);
      setError(out.error);
      return false;
    }
    useV2Store.getState().refresh();
    return true;
  }

  /**
   * Taps go to the durable queue, never straight to the network.
   *
   * The queue is what makes a dropped connection a non-event: the coach keeps
   * scoring, the screen keeps up, and the points post themselves when the wifi
   * comes back. `serverPoints` is deliberately read from the last server
   * snapshot rather than the optimistic state, because that is what the
   * sequence number has to be relative to.
   */
  function submitPoint(slot: 1 | 2, matchId: string) {
    const fromServer = useV2Store.getState().serverPointsFor(matchId);
    enqueuePoint(matchId, slot, fromServer);
  }

  function scoreNow(slot: 1 | 2, target: MatchDTO) {
    const base =
      liveStateRef.current && liveStateRef.current.matchId === target.id ? liveStateRef.current.state : stateFromDTO(target.state);
    const { state: newState } = applyPoint(base, slot, config);
    setError(null);
    liveStateRef.current = { matchId: target.id, state: newState };
    useV2Store.getState().optimisticPoint(target.id, toDTO(newState, config));
    submitPoint(slot, target.id);
  }

  function handleTap(slot: 1 | 2) {
    if (!match || match.status === "completed") return;
    // A coach who starts scoring without pressing Go Live still gets the TV: the
    // screen going live is the thing they must never have to remember.
    if (stage.stage !== "live" || stage.activeMatchId !== match.id) {
      void callCourt("live", match.id);
    }
    const base =
      liveStateRef.current && liveStateRef.current.matchId === match.id ? liveStateRef.current.state : stateFromDTO(match.state);
    const { state: newState, tier } = applyPoint(base, slot, config);
    if (tier === "match") {
      // Read the winner off the resulting state, not from who tapped — under the
      // points-race formats the deciding point is often scored by the losing side.
      const winSlot = newState.matchWinnerSlot ?? slot;
      setConfirmWin({ slot, winnerName: (winSlot === 1 ? match.player1?.name : match.player2?.name) ?? "" });
      return;
    }
    scoreNow(slot, match);
  }

  /** Rebuild the displayed score from the server's version plus whatever is still queued. */
  function repaintFromQueue(matchId: string) {
    const serverState = useV2Store.getState().serverStateFor(matchId);
    if (!serverState) {
      liveStateRef.current = null;
      useV2Store.getState().refresh();
      return;
    }
    let rebuilt = stateFromDTO(serverState);
    for (const q of queuedFor(matchId)) rebuilt = applyPoint(rebuilt, q.slot, config).state;
    liveStateRef.current = { matchId, state: rebuilt };
    useV2Store.getState().optimisticPoint(matchId, toDTO(rebuilt, config));
  }

  /**
   * Take back the last point.
   *
   * If that point is still sitting in the phone's queue it never reached the
   * server, so it is simply removed from the queue — which is also what makes
   * undo work with no connection at all. Sending an undo in that situation would
   * be actively wrong: the server would delete a different, older point that was
   * genuinely scored.
   *
   * Only once the queue is empty does the undo belong to the server, and then it
   * carries the seq it means to remove, so a lost reply cannot make a second
   * point disappear.
   */
  async function undo() {
    if (!match) return;
    setError(null);

    if (popLast(match.id)) {
      repaintFromQueue(match.id);
      return;
    }

    setBusy(true);
    const expectedLastSeq = useV2Store.getState().serverPointsFor(match.id);
    const out = await postWithRetry<{ removed: boolean }>(
      `/api/matches/${match.id}/undo`,
      { pin, expectedLastSeq: expectedLastSeq || undefined },
      () => setCourtRetrying(true)
    );
    setBusy(false);
    setCourtRetrying(false);

    if (out.kind === "offline") {
      setError("No connection — nothing was undone. Try again in a moment.");
      return;
    }
    if (out.kind === "rejected") {
      if (out.status === 401) setPinInvalid(true);
      setError(out.error);
      return;
    }
    liveStateRef.current = null;
    useV2Store.getState().refresh();
  }

  /**
   * End the match early — a retirement, an injury, a no-show.
   *
   * Retried rather than queued, and this is the one where the distinction bites
   * hardest: ending a match sends its winner into the next round and can trigger
   * a decider or the semifinals. Replaying that from a durable queue minutes
   * later would push those consequences into a draw that has moved on. Points
   * are additive and checked against a sequence; a result is structural.
   *
   * It also waits for any unsent taps, so the queue cannot arrive after the
   * match has been closed and be rejected as points on a finished match.
   */
  async function retire() {
    if (!match || !retireSlot) return;
    setError(null);

    if (pendingFor(match.id) > 0) {
      setError("Some points have not been sent yet — wait for those to go through, then end the match.");
      return;
    }

    setBusy(true);
    setCourtRetrying(false);
    const out = await postWithRetry(
      `/api/matches/${match.id}/force-end`,
      { winnerSlot: retireSlot, reason: retireReason.trim() || "Retired", pin },
      () => setCourtRetrying(true)
    );
    setBusy(false);
    setCourtRetrying(false);

    if (out.kind === "offline") {
      setError("No connection — the match has not been ended. Try again in a moment.");
      return;
    }
    if (out.kind === "rejected") {
      if (out.status === 401) setPinInvalid(true);
      setError(out.error);
      return;
    }
    setRetireOpen(false);
    setRetireSlot(null);
    useV2Store.getState().refresh();
  }

  const header = (
    <header className="flex items-center justify-between gap-3 py-3 sticky top-0 bg-court-bg/95 backdrop-blur z-20 border-b border-court-line -mx-4 px-4">
      <div className="flex items-center gap-3 min-w-0">
        <ClubMark size={30} />
        <div className="min-w-0">
          <p className="font-display uppercase tracking-[0.3em] text-gold/80 text-[10px]">Coach console</p>
          <h1 className="font-display text-xl uppercase font-bold leading-none truncate">{courtLabel}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {stage.stage === "live" && (
          <span className="flex items-center gap-1 text-[10px] uppercase text-live font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" /> On air
          </span>
        )}
        <PinBar invalid={pinInvalid} onDismissInvalid={() => setPinInvalid(false)} />
      </div>
    </header>
  );

  const footerLinks = (
    <div className="flex items-center justify-center gap-4 mt-6 pb-6">
      <Link href="/v2/coach?change=1" className="text-white/35 text-xs underline underline-offset-4">
        Change court
      </Link>
      <span className="text-white/15">·</span>
      <Link href={`/v2/tv/${courtId}`} className="text-white/35 text-xs underline underline-offset-4">
        Open this court&apos;s TV
      </Link>
      <span className="text-white/15">·</span>
      <Link href="/v2/ceremony" className="text-white/35 text-xs underline underline-offset-4">
        Awards
      </Link>
    </div>
  );

  // --- ceremony takes over every screen in the venue -----------------------
  if (snapshot.v2.ceremony.stage !== "idle") {
    return (
      <main className="min-h-screen p-4 max-w-lg mx-auto flex flex-col">
        {header}
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <p className="text-5xl">🏆</p>
          <h2 className="font-display uppercase text-xl">The awards presentation is on the screens</h2>
          <p className="text-white/50 text-sm">Court screens return to normal when the presentation is closed.</p>
          <Link href="/v2/ceremony" className="rounded-xl bg-gold text-court-bg font-display uppercase font-bold px-6 py-3">
            Open the announcer remote
          </Link>
        </div>
        {footerLinks}
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto flex flex-col">
      {header}

      {error && <p className="text-live text-sm text-center mt-3">{error}</p>}

      {/* --- held winner: the TV is frozen until this button is pressed ----- */}
      {view.screen === "winner" && match && (
        <div className="flex-1 flex flex-col justify-center gap-5 py-6">
          <div className="rounded-3xl border-2 border-gold bg-court-panel p-6 text-center">
            <p className="text-5xl mb-2">🏆</p>
            <p className="font-display uppercase tracking-[0.3em] text-gold text-xs mb-2">Winner on {courtLabel}</p>
            <h2 className="font-display font-bold uppercase text-3xl text-gold break-words">{view.winnerName}</h2>
            <p className="text-white/50 text-sm mt-2">
              def. {view.loserName}
              {match.forcedEnd ? ` · ${match.forcedEndReason ?? "walkover"}` : ` · ${formatMatchScoreLine(match)}`}
            </p>
          </div>

          <p className="text-white/45 text-sm text-center px-4">
            The TV is holding this celebration. Finish when the players have left the court.
          </p>

          <button
            onClick={() => callCourt("finish")}
            disabled={busy}
            className="rounded-2xl bg-gold text-court-bg font-display uppercase font-bold text-xl py-6 disabled:opacity-50"
          >
            {courtRetrying ? "Reconnecting…" : "Finish · back to standings"}
          </button>

          <button
            onClick={undo}
            disabled={busy}
            className="rounded-xl border border-court-line text-white/60 font-display uppercase text-sm py-3"
          >
            Undo last point (wrong result)
          </button>

          {upNext && (
            <p className="text-white/35 text-xs text-center">
              Up next here: {upNext.player1?.name ?? "TBD"} vs {upNext.player2?.name ?? "TBD"}
            </p>
          )}
        </div>
      )}

      {/* --- live scoring --------------------------------------------------- */}
      {view.screen === "live" && match && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 py-3">
          <OutboxBanner queued={queued} status={outbox.status} />
          <div className="flex items-center justify-between gap-2">
            <BracketBadge bracket={match.bracket} roundName={match.roundName} size="sm" />
            <span className="text-white/35 text-[11px] uppercase tracking-widest">
              {match.status === "in_progress" ? "Scoring live" : "Ready — first point starts the clock"}
            </span>
          </div>

          <ScorePad match={match} onTap={handleTap} disabled={busy} />

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={undo}
              disabled={busy}
              className="rounded-xl border border-court-line py-3 font-display uppercase text-sm text-white/70"
            >
              ↶ Undo
            </button>
            <Link
              href={`/scorer/${match.id}?score=1`}
              className="rounded-xl border border-court-line py-3 font-display uppercase text-sm text-white/70 text-center"
            >
              Edit score
            </Link>
            <button
              onClick={() => {
                setRetireOpen(true);
                setRetireSlot(null);
              }}
              className="rounded-xl border border-court-line py-3 font-display uppercase text-sm text-white/70"
            >
              Retire
            </button>
          </div>
        </div>
      )}

      {/* --- a match is on the court but the TV is not showing it yet ------- */}
      {view.screen !== "live" && view.screen !== "winner" && match && (
        <div className="flex-1 flex flex-col justify-center gap-5 py-6">
          <div className="rounded-3xl border border-court-line bg-court-panel p-6 text-center">
            <BracketBadge bracket={match.bracket} roundName={match.roundName} size="sm" />
            <p className="font-display font-bold uppercase text-2xl mt-3 break-words">{match.player1?.name ?? "TBD"}</p>
            <p className="text-gold/70 font-display uppercase text-sm my-1">vs</p>
            <p className="font-display font-bold uppercase text-2xl break-words">{match.player2?.name ?? "TBD"}</p>
          </div>

          <button
            onClick={() => callCourt("live", match.id)}
            disabled={busy || !match.player1 || !match.player2}
            className="rounded-2xl bg-gold text-court-bg font-display uppercase font-bold text-xl py-6 disabled:opacity-50"
          >
            {courtRetrying ? "Reconnecting…" : "▶ Start match · take over the TV"}
          </button>

          {canSwapOut(match) && (
            <button
              onClick={() => setSwapOpen(true)}
              disabled={busy}
              className="rounded-2xl border border-court-line text-white/70 font-display uppercase text-sm py-4 disabled:opacity-50"
            >
              Someone missing? Change the match
            </button>
          )}

          <p className="text-white/40 text-xs text-center px-6">
            The court screen becomes a full-screen scoreboard. Scoring a point starts it automatically if you forget.
          </p>
        </div>
      )}

      {/* --- nothing to do on this court ------------------------------------ */}
      {!match && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 py-10">
          <span className="opacity-25">
            <ClubMark size={54} />
          </span>
          {allPlayed ? (
            <>
              <h2 className="font-display uppercase text-xl">All matches are complete</h2>
              <p className="text-white/45 text-sm">The screens are waiting for the results presentation.</p>
              <Link href="/v2/ceremony" className="rounded-xl bg-gold text-court-bg font-display uppercase font-bold px-6 py-3">
                Go to the awards remote
              </Link>
            </>
          ) : (
            <>
              <h2 className="font-display uppercase text-xl">No match on {courtLabel} yet</h2>
              <p className="text-white/45 text-sm">This console wakes up as soon as a match is assigned here.</p>
            </>
          )}
        </div>
      )}

      {footerLinks}

      {/* --- confirm the match-winning point -------------------------------- */}
      {confirmWin && match && (
        <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-3xl border border-gold/50 bg-court-panel p-6 text-center">
            <p className="text-4xl mb-3">🏁</p>
            <h3 className="font-display uppercase text-lg mb-1">This point wins the match</h3>
            <p className="text-gold font-display font-bold uppercase text-2xl mb-4 break-words">{confirmWin.winnerName}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const slot = confirmWin.slot;
                  setConfirmWin(null);
                  scoreNow(slot, match);
                }}
                className="rounded-xl bg-gold text-court-bg font-display uppercase font-bold py-4"
              >
                Confirm — end the match
              </button>
              <button
                onClick={() => setConfirmWin(null)}
                className="rounded-xl border border-court-line py-3 font-display uppercase text-white/60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- retirement / walkover ------------------------------------------ */}
      {swapOpen && match && (
        <SwapMatchSheet
          courtId={courtId}
          outgoing={match}
          matches={snapshot.matches}
          busy={busy}
          retrying={swapRetrying}
          onPick={swapIn}
          onClose={() => setSwapOpen(false)}
        />
      )}

      {retireOpen && match && (
        <div className="fixed inset-0 z-40 bg-black/80 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl border border-court-line bg-court-panel p-6">
            <h3 className="font-display uppercase text-lg mb-3">End the match early</h3>
            <p className="text-white/45 text-sm mb-3">Who takes the win?</p>
            <div className="flex flex-col gap-2 mb-4">
              {([1, 2] as const).map((slot) => {
                const player = slot === 1 ? match.player1 : match.player2;
                return (
                  <button
                    key={slot}
                    onClick={() => setRetireSlot(slot)}
                    className={`rounded-xl border py-3 font-display uppercase ${
                      retireSlot === slot ? "border-gold bg-gold/10 text-gold" : "border-court-line text-white/70"
                    }`}
                  >
                    {player?.name ?? "TBD"}
                  </button>
                );
              })}
            </div>
            <input
              value={retireReason}
              onChange={(e) => setRetireReason(e.target.value)}
              placeholder="Reason (retired, walkover…)"
              className="w-full bg-court-panel2 border border-court-line rounded-xl px-4 py-3 mb-4 outline-none focus:ring-2 ring-gold/50"
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={retire}
                disabled={!retireSlot || busy}
                className="rounded-xl bg-gold text-court-bg font-display uppercase font-bold py-4 disabled:opacity-40"
              >
                {courtRetrying ? "Reconnecting…" : "End match"}
              </button>
              <button
                onClick={() => setRetireOpen(false)}
                className="rounded-xl border border-court-line py-3 font-display uppercase text-white/60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function CoachCourtPage() {
  const params = useParams<{ courtId: string }>();
  const courtId = Number(params.courtId);

  if (!Number.isInteger(courtId)) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/50">
        Bad court in the URL — try <span className="text-gold ml-1">/v2/coach/2</span>
      </div>
    );
  }

  return (
    <V2Gate>
      <CoachConsole courtId={courtId} />
    </V2Gate>
  );
}
