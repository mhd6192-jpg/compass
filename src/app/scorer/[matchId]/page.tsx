"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import ConnectionGate from "@/components/shared/ConnectionGate";
import BracketBadge from "@/components/shared/BracketBadge";
import PinBar from "@/components/scorer/PinBar";
import { findMatch, useCompassStore } from "@/store/useCompassStore";
import { usePinStore } from "@/store/usePinStore";
import { applyPoint, stateFromDTO, toDTO } from "@/lib/scoring/engine";
import { TiebreakMode, isPointsRace, raceTargetOf, raceTotalPoints, raceWinByOf } from "@/lib/types";

function ScoringContent() {
  const params = useParams<{ matchId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const wantsQuickScore = searchParams.get("score") === "1";
  const snapshot = useCompassStore((s) => s.snapshot)!;
  const pin = usePinStore((s) => s.pin);

  const match = findMatch(snapshot, params.matchId);

  const [pinInvalid, setPinInvalid] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ slot: 1 | 2; winnerName: string } | null>(null);
  const [forceEndOpen, setForceEndOpen] = useState(false);
  const [forceEndSlot, setForceEndSlot] = useState<1 | 2 | null>(null);
  const [forceEndReason, setForceEndReason] = useState("");
  const [justCompleted, setJustCompleted] = useState(false);

  const [scoreOpen, setScoreOpen] = useState(false);
  const [completedRows, setCompletedRows] = useState<{ a: number; b: number }[]>([]);
  const [currentRow, setCurrentRow] = useState<{ a: number; b: number }>({ a: 0, b: 0 });
  const [useCurrentRow, setUseCurrentRow] = useState(false);
  const [fixingCompleted, setFixingCompleted] = useState(false);

  const [namesOpen, setNamesOpen] = useState(false);
  const [name1, setName1] = useState("");
  const [name2, setName2] = useState("");
  const [namesSubmitting, setNamesSubmitting] = useState(false);

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

  // The points-race formats are a single race, not sets and games: the score
  // editor needs to reach the race target (a whitewash is legal) and must drop
  // the set-based controls, which have no meaning in these formats.
  const pointsRace = isPointsRace(config.tiebreakMode);
  const firstTo = config.tiebreakMode === "race-to-16";
  const target = raceTargetOf(config);
  const targetTotal = raceTotalPoints(config);
  const winBy = raceWinByOf(config);
  // Win-by-two can run past the target, so the editor must be able to reach it.
  const maxScore = pointsRace ? (firstTo ? (winBy === 2 ? target + 12 : target) : targetTotal) : 15;
  const raceTotal = (completedRows[0]?.a ?? 0) + (completedRows[0]?.b ?? 0);
  const raceScoreValid =
    !pointsRace ||
    (() => {
      const a = completedRows[0]?.a ?? 0;
      const b = completedRows[0]?.b ?? 0;
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      if (firstTo) {
        // Win by two: at least the target AND two clear, and past the target the
        // margin is exactly two, since it stops the moment someone is two ahead.
        if (winBy === 2) return hi >= target && hi - lo >= 2 && (hi === target || hi - lo === 2);
        // Sudden death: the winner has exactly T (T-(T-1) is legal).
        return hi === target && lo <= target - 1;
      }
      return (hi + lo === targetTotal && hi !== lo) || (hi + lo === targetTotal + 1 && hi - lo === 1);
    })();

  // Serializes point POSTs in the background so rapid taps can't race each
  // other server-side, while the UI itself never waits on this chain.
  const pointChain = useRef(Promise.resolve());

  // The base to build the *next* tap's point on. Reading `match.state` fresh on
  // every tap is what caused the score to jump around: two taps fired before
  // React re-rendered would both compute "+1" from the same stale base (a lost
  // update), and the next poll would then jump the display to correct for it.
  // This ref instead advances synchronously, in the same tick as each tap.
  const liveStateRef = useRef<{ matchId: string; state: ReturnType<typeof stateFromDTO> } | null>(null);
  useEffect(() => {
    liveStateRef.current = null;
  }, [match?.id]);

  // "Set score" from the match list links here with ?score=1 so a coach can
  // enter/finalize a result directly without stepping through live scoring.
  useEffect(() => {
    if (!wantsQuickScore || !match || !match.player1 || !match.player2) return;
    router.replace(`/scorer/${match.id}`);
    const rows = match.state.completedSets.map((s) => (s.tiebreak && s.games[0] + s.games[1] === 1 ? { a: s.tiebreak[0], b: s.tiebreak[1] } : { a: s.games[0], b: s.games[1] }));
    setCompletedRows(rows.length ? rows : [{ a: 0, b: 0 }]);
    const cur = match.state.currentSet?.games;
    setCurrentRow(cur ? { a: cur[0], b: cur[1] } : { a: 0, b: 0 });
    setUseCurrentRow(false);
    setScoreOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsQuickScore, match?.id]);

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-white/50 mb-4">Match not found.</p>
          <button onClick={() => router.push("/scorer")} className="rounded-xl bg-gold text-court-bg font-display uppercase font-bold px-6 py-3">
            Back to matches
          </button>
        </div>
      </div>
    );
  }

  if (!match.player1 || !match.player2) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-white/50 mb-4">Waiting for both players to be determined for this match.</p>
          <button onClick={() => router.push("/scorer")} className="rounded-xl bg-gold text-court-bg font-display uppercase font-bold px-6 py-3">
            Back to matches
          </button>
        </div>
      </div>
    );
  }

  // Persists a point in the background. Doesn't block the UI — the tap zone
  // already reflected the point optimistically before this was even called.
  function submitPoint(slot: 1 | 2) {
    if (!match) return Promise.resolve();
    const matchId = match.id;
    const store = useCompassStore.getState();
    store.beginPending(matchId);
    const run = async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}/point`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot, pin }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) setPinInvalid(true);
          setLocalError(data.error || "Failed to score point");
          liveStateRef.current = null;
          useCompassStore.getState().refresh(); // undo the bad optimistic guess
          return;
        }
        if (data.completed) setJustCompleted(true);
      } catch {
        setLocalError("Network error — check the connection and try again.");
        liveStateRef.current = null;
        useCompassStore.getState().refresh();
      } finally {
        useCompassStore.getState().endPending(matchId);
      }
    };
    pointChain.current = pointChain.current.then(run);
    return pointChain.current;
  }

  function handleTap(slot: 1 | 2) {
    if (!match || match.status === "completed") return;
    const base =
      liveStateRef.current && liveStateRef.current.matchId === match.id ? liveStateRef.current.state : stateFromDTO(match.state);
    const { state: newState, tier } = applyPoint(base, slot, config);
    if (tier === "match") {
      // Read the winner off the resulting state, not from who tapped: under the
      // 16-points-total rule the deciding point is often scored by the side that
      // still loses (6-9 → 7-9 ends the match in the opponent's favour).
      const winSlot = newState.matchWinnerSlot ?? slot;
      const winnerName = (winSlot === 1 ? match.player1?.name : match.player2?.name) ?? "";
      setPendingConfirm({ slot, winnerName });
      return;
    }
    setLocalError(null);
    liveStateRef.current = { matchId: match.id, state: newState };
    useCompassStore.getState().optimisticPoint(match.id, toDTO(newState, config));
    submitPoint(slot);
  }

  async function undo() {
    if (!match) return;
    setLocalError(null);
    const res = await fetch(`/api/matches/${match.id}/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) setPinInvalid(true);
      setLocalError(data.error || "Failed to undo");
    } else {
      setJustCompleted(false);
    }
  }

  function openScore() {
    if (!match) return;
    const rows = match.state.completedSets.map((s) => (s.tiebreak && s.games[0] + s.games[1] === 1 ? { a: s.tiebreak[0], b: s.tiebreak[1] } : { a: s.games[0], b: s.games[1] }));
    setCompletedRows(rows.length ? rows : [{ a: 0, b: 0 }]);
    const cur = match.state.currentSet?.games;
    setCurrentRow(cur ? { a: cur[0], b: cur[1] } : { a: 0, b: 0 });
    setUseCurrentRow(false);
    setLocalError(null);
    setScoreOpen(true);
  }

  // Editing a completed match requires reopening it first (undo retracts any
  // downstream routing safely) — capture the final score before that happens
  // so the editor opens pre-filled with what's actually being corrected.
  async function fixCompletedResult() {
    if (!match) return;
    setLocalError(null);
    const rows = match.state.completedSets.map((s) => (s.tiebreak && s.games[0] + s.games[1] === 1 ? { a: s.tiebreak[0], b: s.tiebreak[1] } : { a: s.games[0], b: s.games[1] }));
    setFixingCompleted(true);
    const res = await fetch(`/api/matches/${match.id}/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    setFixingCompleted(false);
    if (!res.ok) {
      if (res.status === 401) setPinInvalid(true);
      setLocalError(data.error || "Failed to reopen match");
      return;
    }
    setJustCompleted(false);
    setCompletedRows(rows.length ? rows : [{ a: 0, b: 0 }]);
    setCurrentRow({ a: 0, b: 0 });
    setUseCurrentRow(false);
    setScoreOpen(true);
  }

  async function saveNames() {
    if (!match) return;
    setNamesSubmitting(true);
    setLocalError(null);
    const res = await fetch(`/api/matches/${match.id}/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player1Name: name1.trim(), player2Name: name2.trim(), pin }),
    });
    const data = await res.json();
    setNamesSubmitting(false);
    if (!res.ok) {
      if (res.status === 401) setPinInvalid(true);
      setLocalError(data.error || "Failed to rename player");
      return;
    }
    setNamesOpen(false);
  }

  function openNames() {
    if (!match) return;
    setName1(match.player1?.name ?? "");
    setName2(match.player2?.name ?? "");
    setLocalError(null);
    setNamesOpen(true);
  }

  async function submitScore(finalize: boolean) {
    if (!match) return;
    setLocalError(null);
    const completedSets = completedRows.filter((r) => !(r.a === 0 && r.b === 0));
    const bodyReq: Record<string, unknown> = { completedSets, pin, finalize };
    if (!finalize && useCurrentRow) bodyReq.currentSetGames = [currentRow.a, currentRow.b];
    if (completedSets.length === 0 && !(!finalize && useCurrentRow)) {
      setLocalError("Enter at least one set score");
      return;
    }
    const res = await fetch(`/api/matches/${match.id}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyReq),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) setPinInvalid(true);
      setLocalError(data.error || "Failed to save score");
      return;
    }
    setScoreOpen(false);
    if (data.completed) setJustCompleted(true);
  }

  async function confirmForceEnd() {
    if (!match || forceEndSlot === null) return;
    setLocalError(null);
    const res = await fetch(`/api/matches/${match.id}/force-end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winnerSlot: forceEndSlot, reason: forceEndReason || "Forced end", pin }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) setPinInvalid(true);
      setLocalError(data.error || "Failed to end match");
      return;
    }
    setForceEndOpen(false);
    setJustCompleted(true);
  }

  const scoreModal = scoreOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-court-panel border border-court-line rounded-2xl p-5 max-w-sm w-full my-6"
      >
        <h2 className="font-display text-xl uppercase mb-1 text-center">{pointsRace ? "Final score" : "Enter / edit score"}</h2>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2 text-sm mb-3 mt-4">
          <span className="text-white/40 text-xs uppercase tracking-wide" />
          <span className="text-center text-white/70 font-display uppercase text-xs truncate w-16">{match.player1!.name}</span>
          <span className="text-center text-white/70 font-display uppercase text-xs truncate w-16">{match.player2!.name}</span>

          {completedRows.map((row, idx) => (
            <ScoreRowInput
              key={idx}
              label={pointsRace ? "Points" : `Set ${idx + 1}`}
              row={row}
              onStep={(field, delta) =>
                setCompletedRows((prev) => prev.map((x, i) => (i === idx ? { ...x, [field]: clampScore(x[field] + delta, maxScore) } : x)))
              }
              onRemove={!pointsRace && completedRows.length > 1 ? () => setCompletedRows((prev) => prev.filter((_, i) => i !== idx)) : undefined}
            />
          ))}
        </div>

        {/* Sets/games controls make no sense in a single points race. */}
        {!pointsRace && (
          <>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setCompletedRows((prev) => [...prev, { a: 0, b: 0 }])}
                disabled={completedRows.length >= config.bestOfSets}
                className="text-xs text-gold underline underline-offset-4 disabled:opacity-30"
              >
                + Add set
              </button>
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input type="checkbox" checked={useCurrentRow} onChange={(e) => setUseCurrentRow(e.target.checked)} />
                In-progress set
              </label>
            </div>

            {useCurrentRow && (
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2 mb-4">
                <ScoreRowInput
                  label="Current"
                  row={currentRow}
                  onStep={(field, delta) => setCurrentRow((prev) => ({ ...prev, [field]: clampScore(prev[field] + delta, maxScore) }))}
                />
              </div>
            )}
          </>
        )}

        {pointsRace ? (
          <p className={`text-[11px] mb-4 leading-relaxed ${raceScoreValid ? "text-white/35" : "text-live"}`}>
            {firstTo && winBy === 2
              ? raceScoreValid
                ? `${completedRows[0].a}-${completedRows[0].b} — first to ${target}, win by 2. Winner is the higher score.`
                : `First to ${target}, win by 2: the winner needs ${target} or more with a two-point lead, and past ${target} the margin is exactly two. Currently ${completedRows[0].a}-${completedRows[0].b}.`
              : firstTo
              ? raceScoreValid
                ? `${completedRows[0].a}-${completedRows[0].b} — ${Math.min(completedRows[0].a, completedRows[0].b) === target - 1 ? "sudden-death finish" : `first to ${target}`}. Winner is the higher score.`
                : `First to ${target} wins: the winner must have exactly ${target} and the loser 0-${target - 1} (${target}-${target - 1} is a legal sudden-death finish). Currently ${completedRows[0].a}-${completedRows[0].b}.`
              : raceScoreValid
              ? `${completedRows[0].a}-${completedRows[0].b} — ${raceTotal === targetTotal + 1 ? "sudden-death decider" : `${targetTotal} points`}. Winner is the higher score.`
              : `Must total ${targetTotal} points (e.g. ${target}-${target - 2}, ${targetTotal}-0), or ${targetTotal + 1} with a 1-point margin if it reached ${target - 1}-${target - 1} (e.g. ${target}-${target - 1}). Currently ${completedRows[0].a}-${completedRows[0].b} = ${raceTotal}.`}
          </p>
        ) : (
          <p className="text-white/35 text-[11px] mb-4 leading-relaxed">
            Best of {config.bestOfSets}. “Finish match” records the final score and routes the loser. “Save” keeps the match live with this
            score.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => submitScore(true)}
            disabled={pointsRace && !raceScoreValid}
            className="w-full rounded-xl bg-gold text-court-bg py-3 font-display uppercase text-sm font-bold disabled:opacity-40"
          >
            Finish match with this score
          </button>
          <div className="flex gap-2">
            <button onClick={() => setScoreOpen(false)} className="flex-1 rounded-xl border border-court-line py-3 font-display uppercase text-sm">
              Cancel
            </button>
            {!pointsRace && (
              <button
                onClick={() => submitScore(false)}
                className="flex-1 rounded-xl border border-gold/50 text-gold py-3 font-display uppercase text-sm font-bold"
              >
                Save (keep live)
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  const namesModal = namesOpen && (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-court-panel border border-court-line rounded-2xl p-5 max-w-sm w-full"
      >
        <h2 className="font-display text-xl uppercase mb-4 text-center">Edit player names</h2>
        <div className="flex flex-col gap-3 mb-4">
          <input
            value={name1}
            onChange={(e) => setName1(e.target.value)}
            placeholder="Player 1 name"
            className="w-full bg-court-panel2 border border-court-line rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-gold/50"
          />
          <input
            value={name2}
            onChange={(e) => setName2(e.target.value)}
            placeholder="Player 2 name"
            className="w-full bg-court-panel2 border border-court-line rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-gold/50"
          />
        </div>
        <p className="text-white/35 text-[11px] mb-4 leading-relaxed">
          Renames this player everywhere in the draw — they may appear in other matches too.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setNamesOpen(false)} className="flex-1 rounded-xl border border-court-line py-3 font-display uppercase text-sm">
            Cancel
          </button>
          <button
            onClick={saveNames}
            disabled={namesSubmitting || !name1.trim() || !name2.trim()}
            className="flex-1 rounded-xl bg-gold text-court-bg py-3 font-display uppercase text-sm font-bold disabled:opacity-50"
          >
            {namesSubmitting ? "Saving…" : "Save"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

  if (justCompleted || match.status === "completed") {
    const winnerName = match.winnerId === match.player1.id ? match.player1.name : match.player2.name;
    return (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen flex items-center justify-center p-6 text-center">
          <div>
            <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.6 }} className="text-6xl mb-4">
              🏆
            </motion.p>
            <h1 className="font-display text-2xl uppercase mb-2">{winnerName} wins!</h1>
            <p className="text-white/50 mb-6">{match.bracket} · {match.roundName}</p>
            {localError && <p className="text-live text-xs mb-4">{localError}</p>}
            <div className="flex flex-col gap-3">
              <button onClick={() => router.push("/scorer")} className="rounded-xl bg-gold text-court-bg font-display uppercase font-bold py-3 px-8">
                Back to matches
              </button>
              <button
                onClick={fixCompletedResult}
                disabled={fixingCompleted}
                className="text-sm text-white/60 underline underline-offset-4 disabled:opacity-50"
              >
                {fixingCompleted ? "Reopening…" : "Wrong score? Fix result"}
              </button>
              <button onClick={openNames} className="text-xs text-white/40 underline underline-offset-4">
                Edit player names
              </button>
              <button onClick={undo} className="text-xs text-white/30 underline underline-offset-4">
                Undo last point instead
              </button>
            </div>
          </div>
        </motion.div>
        {namesModal}
        {scoreModal}
      </>
    );
  }

  const st = match.state;

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-court-line">
        <button onClick={() => router.push("/scorer")} className="text-white/50 text-xl px-1">
          ‹
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <BracketBadge bracket={match.bracket} roundName={match.roundName} size="sm" />
          {match.courtId && <span className="text-[10px] uppercase text-white/40 font-display">Court {match.courtId}</span>}
        </div>
        <PinBar invalid={pinInvalid} onDismissInvalid={() => setPinInvalid(false)} />
      </header>

      {localError && <p className="text-live text-xs text-center py-1.5 bg-live/10">{localError}</p>}

      {/* context score strip */}
      <div className="flex items-center justify-center gap-4 py-2 text-white/60 text-sm border-b border-court-line/60">
        <span>Sets {st.setsWon[0]}-{st.setsWon[1]}</span>
        {st.currentSet && <span>Games {st.currentSet.games[0]}-{st.currentSet.games[1]}</span>}
        {st.completedSets.length > 0 && (
          <span className="text-white/40">
            {st.completedSets
              .map((s) => `${s.games[0]}-${s.games[1]}`)
              .join(", ")}
          </span>
        )}
      </div>

      {/* two big tap zones */}
      <div className="flex-1 grid grid-cols-2 divide-x divide-court-line">
        {([1, 2] as const).map((slot) => {
          const player = slot === 1 ? match.player1! : match.player2!;
          const label = st.currentGame ? st.currentGame.display[slot - 1] : "0";
          return (
            <button
              key={slot}
              onClick={() => handleTap(slot)}
              className="flex flex-col items-center justify-center gap-4 active:bg-white/5 transition-colors"
            >
              <span className="font-display uppercase text-lg text-white/70 text-center px-2 truncate max-w-full">{player.name}</span>
              {/* Plain key-remount, no AnimatePresence exit-tracking: guarantees the new
                  score actually renders even under fast repeated taps. */}
              <motion.span
                key={`${slot}-${label}`}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", bounce: 0.55, duration: 0.4 }}
                className="font-display font-bold text-8xl sm:text-9xl tabular-nums text-shadow-glow"
              >
                {label}
              </motion.span>
              <span className="text-white/30 text-xs uppercase tracking-widest">Tap for point</span>
            </button>
          );
        })}
      </div>

      <footer className="flex flex-col items-center gap-3 py-4 border-t border-court-line">
        <button
          onClick={openScore}
          className="rounded-xl border border-gold/50 bg-gold/10 text-gold font-display uppercase text-sm font-bold px-6 py-2.5"
        >
          Enter / edit score
        </button>
        <div className="flex items-center justify-center gap-6 flex-wrap">
          <button onClick={undo} className="text-white/50 text-sm underline underline-offset-4">
            Undo last point
          </button>
          <button onClick={openNames} className="text-white/30 text-sm underline underline-offset-4">
            Edit names
          </button>
          <button
            onClick={() => {
              setForceEndSlot(null);
              setForceEndReason("");
              setForceEndOpen(true);
            }}
            className="text-white/30 text-sm underline underline-offset-4"
          >
            End (walkover)
          </button>
        </div>
      </footer>

      {/* match-point confirmation (plain conditional render, no AnimatePresence exit-tracking) */}
      {pendingConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-court-panel border border-gold/40 rounded-2xl p-6 max-w-sm text-center"
          >
            <p className="text-4xl mb-3">🎾</p>
            <h2 className="font-display text-xl uppercase mb-2">Match point</h2>
            <p className="text-white/60 mb-6">
              This point wins the match for <span className="text-gold font-bold">{pendingConfirm.winnerName}</span>. Confirm?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingConfirm(null)}
                className="flex-1 rounded-xl border border-court-line py-3 font-display uppercase text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const slot = pendingConfirm.slot;
                  setPendingConfirm(null);
                  submitPoint(slot);
                }}
                className="flex-1 rounded-xl bg-gold text-court-bg py-3 font-display uppercase text-sm font-bold"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* force-end modal (plain conditional render, no AnimatePresence exit-tracking) */}
      {forceEndOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-6 z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-court-panel border border-court-line rounded-2xl p-6 max-w-sm w-full"
          >
            <h2 className="font-display text-xl uppercase mb-4 text-center">End match early</h2>
            <p className="text-white/50 text-sm mb-3 text-center">Who wins? (retirement / walkover)</p>
            <div className="flex gap-2 mb-4">
              {([1, 2] as const).map((slot) => {
                const player = slot === 1 ? match.player1! : match.player2!;
                return (
                  <button
                    key={slot}
                    onClick={() => setForceEndSlot(slot)}
                    className={`flex-1 rounded-xl py-3 text-sm font-display uppercase border ${
                      forceEndSlot === slot ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/60"
                    }`}
                  >
                    {player.name}
                  </button>
                );
              })}
            </div>
            <input
              value={forceEndReason}
              onChange={(e) => setForceEndReason(e.target.value)}
              placeholder="Reason (e.g. injury retirement)"
              className="w-full bg-court-panel2 border border-court-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-gold/50 mb-4"
            />
            <div className="flex gap-3">
              <button onClick={() => setForceEndOpen(false)} className="flex-1 rounded-xl border border-court-line py-3 font-display uppercase text-sm">
                Cancel
              </button>
              <button
                onClick={confirmForceEnd}
                disabled={forceEndSlot === null}
                className="flex-1 rounded-xl bg-live text-white py-3 font-display uppercase text-sm font-bold disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {scoreModal}
      {namesModal}
    </main>
  );
}

function clampScore(v: number, max: number) {
  return Math.max(0, Math.min(max, v));
}

function Stepper({ value, onStep }: { value: number; onStep: (delta: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onStep(-1)} className="w-7 h-7 rounded-md bg-court-panel2 border border-court-line text-white/70 text-lg leading-none">
        −
      </button>
      <span className="w-6 text-center font-display text-lg tabular-nums">{value}</span>
      <button onClick={() => onStep(1)} className="w-7 h-7 rounded-md bg-court-panel2 border border-court-line text-white/70 text-lg leading-none">
        +
      </button>
    </div>
  );
}

function ScoreRowInput({
  label,
  row,
  onStep,
  onRemove,
}: {
  label: string;
  row: { a: number; b: number };
  onStep: (field: "a" | "b", delta: number) => void;
  onRemove?: () => void;
}) {
  return (
    <>
      <span className="text-white/50 text-xs uppercase tracking-wide flex items-center gap-2">
        {label}
        {onRemove && (
          <button onClick={onRemove} className="text-live/70 text-xs">
            ✕
          </button>
        )}
      </span>
      <Stepper value={row.a} onStep={(d) => onStep("a", d)} />
      <Stepper value={row.b} onStep={(d) => onStep("b", d)} />
    </>
  );
}

export default function ScoringPage() {
  return (
    <ConnectionGate>
      <ScoringContent />
    </ConnectionGate>
  );
}
