"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import V3Gate from "@/components/v3/V3Gate";
import ClubLogo from "@/components/shared/ClubLogo";
import BracketBadge from "@/components/shared/BracketBadge";
import { Ball } from "@/components/v3/ServeIndicator";
import { useV3Store } from "@/store/useV3Store";
import { useV3PlayerStore } from "@/store/useV3PlayerStore";
import { buildPlayerView, opponentOf, ordinal, teamsIn, type PlayerStatus, type PlayerView } from "@/lib/v3/player";
import { scoreLine } from "@/lib/v3/venue";
import { formatMatchScoreLine } from "@/lib/scoring/format";
import type { MatchDTO, PlayerDTO } from "@/lib/types";

function TeamPicker({ teams, onPick }: { teams: PlayerDTO[]; onPick: (id: string) => void }) {
  return (
    <main className="min-h-screen flex flex-col gap-5 p-5 max-w-lg mx-auto w-full">
      <div className="flex flex-col items-center gap-3 text-center mt-8">
        <ClubLogo size={48} />
        <div>
          <p className="font-display uppercase tracking-[0.3em] text-gold/70 text-[10px] mb-1">Players</p>
          <h1 className="font-display uppercase font-bold text-2xl">Which team are you?</h1>
        </div>
        <p className="text-white/45 text-sm">Pick once — this phone will remember you.</p>
      </div>

      <div className="flex flex-col gap-2">
        {teams.map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t.id)}
            className="rounded-2xl border border-court-line bg-court-panel px-4 py-4 text-left font-display uppercase font-bold text-lg active:border-gold"
          >
            {t.name}
          </button>
        ))}
        {teams.length === 0 && <p className="text-white/40 text-sm text-center">No teams in the draw yet.</p>}
      </div>
    </main>
  );
}

/** The one card that answers "when and where do I play". */
function NextUp({ status, teamId }: { status: PlayerStatus; teamId: string }) {
  if (status.kind === "done") {
    return (
      <div className="rounded-3xl border border-gold/50 bg-gold/10 p-6 text-center">
        <p className="text-4xl mb-2">🎉</p>
        <p className="font-display uppercase font-bold text-xl text-gold">All your matches are played</p>
        <p className="text-white/50 text-sm mt-2">Stay for the presentation — the results are announced on the court screens.</p>
      </div>
    );
  }

  const opponent = opponentOf(status.match, teamId);
  const vs = opponent?.name ?? "TBD";

  if (status.kind === "playing") {
    const score = scoreLine(status.match);
    const mine = status.match.player1?.id === teamId ? score.a : score.b;
    const theirs = status.match.player1?.id === teamId ? score.b : score.a;
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border-2 border-live/60 bg-court-panel p-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-live animate-pulse" />
          <span className="font-display uppercase tracking-[0.25em] text-live text-xs">You are on court now</span>
        </div>
        <p className="font-display uppercase font-bold text-3xl">Court {status.courtId}</p>
        <p className="text-white/55 mt-1">vs {vs}</p>
        <div className="flex items-baseline gap-3 mt-4">
          <span className="font-display font-bold text-5xl text-gold tabular-nums">{mine}</span>
          <span className="text-white/30 text-xl">–</span>
          <span className="font-display font-bold text-3xl text-white/60 tabular-nums">{theirs}</span>
        </div>
      </motion.div>
    );
  }

  if (status.kind === "called") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border-2 border-gold/60 bg-court-panel p-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <Ball size={18} />
          <span className="font-display uppercase tracking-[0.25em] text-gold text-xs">
            {status.queuedBehind ? "You are next on" : "You are up on"}
          </span>
        </div>
        <p className="font-display uppercase font-bold text-3xl">Court {status.courtId}</p>
        <p className="text-white/55 mt-1">vs {vs}</p>
        <p className="text-white/40 text-sm mt-4">
          {status.queuedBehind
            ? "Head over — you play as soon as the current match finishes."
            : "Go to the court now, your coach is ready to start."}
        </p>
      </motion.div>
    );
  }

  if (status.kind === "blocked") {
    return (
      <div className="rounded-3xl border border-court-line bg-court-panel p-6">
        <p className="font-display uppercase tracking-[0.25em] text-white/45 text-xs mb-3">Your next match</p>
        <p className="font-display uppercase font-bold text-2xl">{status.match.roundName}</p>
        <p className="text-white/45 text-sm mt-2">Waiting on an earlier result to know who you play.</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-court-line bg-court-panel p-6">
      <p className="font-display uppercase tracking-[0.25em] text-white/45 text-xs mb-3">Your next match</p>
      <p className="font-display uppercase font-bold text-2xl break-words">vs {vs}</p>
      <p className="text-white/45 text-sm mt-3">
        Waiting for a court — {status.onCourtNow} match{status.onCourtNow === 1 ? "" : "es"} being played, {status.waiting}{" "}
        waiting to be called.
      </p>
      <p className="text-white/30 text-xs mt-3">
        Courts are filled as they free up, giving the longest rest to whoever just played — so there is no fixed time.
        Keep an eye on this page.
      </p>
    </div>
  );
}

function ResultRow({ match, teamId }: { match: MatchDTO; teamId: string }) {
  const won = match.winnerId === teamId;
  const opponent = opponentOf(match, teamId);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
      <span
        className={`shrink-0 w-6 h-6 rounded-lg grid place-items-center font-display font-bold text-xs ${
          won ? "bg-gold text-court-bg" : "bg-white/10 text-white/50"
        }`}
      >
        {won ? "W" : "L"}
      </span>
      <span className="flex-1 min-w-0 truncate text-white/75 text-sm">{opponent?.name ?? "TBD"}</span>
      <span className="shrink-0 text-white/45 text-sm tabular-nums">
        {match.forcedEnd ? match.forcedEndReason ?? "Walkover" : formatMatchScoreLine(match)}
      </span>
    </div>
  );
}

function PlayerCard({ view, onChange }: { view: PlayerView; onChange: () => void }) {
  const { team, row, position, tableSize, tableLabel } = view;

  return (
    <main className="min-h-screen flex flex-col gap-4 p-4 max-w-lg mx-auto w-full">
      <header className="flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-3 min-w-0">
          <ClubLogo size={34} />
          <div className="min-w-0">
            <p className="font-display uppercase tracking-[0.3em] text-gold/70 text-[10px]">Your card</p>
            <h1 className="font-display uppercase font-bold text-lg truncate">{team.name}</h1>
          </div>
        </div>
        <button onClick={onChange} className="text-white/35 text-xs underline underline-offset-4 shrink-0">
          Not you?
        </button>
      </header>

      <NextUp status={view.status} teamId={team.id} />

      {row && (
        <div className="rounded-2xl border border-court-line bg-court-panel p-4">
          <div className="flex items-baseline justify-between mb-3">
            <span className="font-display uppercase text-sm text-white/60">
              {tableLabel ? `${tableLabel} standing` : "Standing"}
            </span>
            {position && (
              <span className="font-display uppercase text-gold">
                {ordinal(position)} <span className="text-white/30">of {tableSize}</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Won", value: row.won },
              { label: "Lost", value: row.lost },
              { label: "Points", value: row.pointsFor },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-white/[0.03] py-2.5">
                <p className="font-display font-bold text-2xl tabular-nums">{s.value}</p>
                <p className="text-white/35 text-[10px] uppercase tracking-widest">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {view.played.length > 0 && (
        <section className="rounded-2xl border border-court-line bg-court-panel p-4">
          <h2 className="font-display uppercase text-sm text-white/60 mb-3">Your results</h2>
          <div className="flex flex-col gap-2">
            {view.played.map((m) => (
              <ResultRow key={m.id} match={m} teamId={team.id} />
            ))}
          </div>
        </section>
      )}

      {view.upcoming.length > 1 && (
        <section className="rounded-2xl border border-court-line bg-court-panel p-4">
          <h2 className="font-display uppercase text-sm text-white/60 mb-3">Still to play</h2>
          <div className="flex flex-col gap-2">
            {view.upcoming.slice(1).map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <BracketBadge bracket={m.bracket} roundName={m.roundName} size="sm" />
                <span className="flex-1 min-w-0 truncate text-white/60 text-sm">
                  {opponentOf(m, team.id)?.name ?? "TBD"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="text-center pb-8 pt-2">
        <Link href="/v3/board" className="text-white/30 text-xs underline underline-offset-4">
          See every court
        </Link>
      </div>
    </main>
  );
}

/**
 * The page a player opens on their own phone.
 *
 * Deliberately read-only and PIN-free: it is meant to be scanned off a QR code
 * on the wall by anyone in the building, so it can show but never change. That
 * is also what makes it safe to leave on the big board all day.
 */
function PlayerScreen() {
  const snapshot = useV3Store((s) => s.snapshot)!;
  const teamId = useV3PlayerStore((s) => s.teamId);
  const setTeam = useV3PlayerStore((s) => s.setTeam);

  const teams = teamsIn(snapshot.matches);
  const team = teams.find((t) => t.id === teamId) ?? null;

  if (!team) return <TeamPicker teams={teams} onPick={setTeam} />;

  return <PlayerCard view={buildPlayerView(snapshot.matches, team)} onChange={() => setTeam(null)} />;
}

export default function PlayerPage() {
  return (
    <V3Gate>
      <PlayerScreen />
    </V3Gate>
  );
}
