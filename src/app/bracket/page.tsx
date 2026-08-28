"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ConnectionGate from "@/components/shared/ConnectionGate";
import BracketBadge from "@/components/shared/BracketBadge";
import ClubLogo from "@/components/shared/ClubLogo";
import { BracketCode, MatchDTO } from "@/lib/types";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import { formatMatchScoreLine } from "@/lib/scoring/format";
import { useCompassStore } from "@/store/useCompassStore";
import { computeStandings } from "@/lib/standings";

const ALL_BRACKETS: BracketCode[] = ["E", "W", "N", "S", "NE", "SE", "NW", "SW"];

// Spectators scanning the TV's QR code don't know what "East/West" means — the
// compass points are internal routing labels. Friendly draw names here instead;
// the actual TV compass-rose visual keeps the directional names on purpose.
const FRIENDLY_LABELS: Record<BracketCode, string> = {
  E: "Gold Draw",
  W: "Silver Draw",
  N: "Bronze Draw",
  S: "Copper Draw",
  NE: "Silver Playoff",
  SE: "Bronze Playoff",
  NW: "Copper Playoff",
  SW: "Wooden Spoon",
  RR: "Group",
  GA: "Group A",
  GB: "Group B",
  SF: "Semifinal",
  F: "Final",
};

function MatchLine({ match }: { match: MatchDTO }) {
  const p1Winner = match.winnerId && match.winnerId === match.player1?.id;
  const p2Winner = match.winnerId && match.winnerId === match.player2?.id;
  const scoreLine = match.status === "completed" ? formatMatchScoreLine(match) : null;

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-court-line/60 last:border-0">
      <div className="min-w-0">
        <p className={`truncate text-sm ${p1Winner ? "text-gold font-bold" : "text-white/80"}`}>{match.player1?.name ?? "TBD"}</p>
        <p className={`truncate text-sm ${p2Winner ? "text-gold font-bold" : "text-white/80"}`}>{match.player2?.name ?? "TBD"}</p>
      </div>
      <div className="text-right shrink-0">
        {scoreLine ? (
          <p className="text-xs text-white/50 font-mono">{scoreLine}</p>
        ) : match.status === "in_progress" ? (
          <p className="text-xs text-live font-bold uppercase">Live</p>
        ) : match.courtId ? (
          <p className="text-xs text-white/30">Court {match.courtId}</p>
        ) : (
          <p className="text-xs text-white/20">—</p>
        )}
      </div>
    </div>
  );
}

function BracketSection({ bracket, matches }: { bracket: BracketCode; matches: MatchDTO[] }) {
  const style = BRACKET_STYLE[bracket];
  const rounds = useMemo(() => {
    const byRound = new Map<number, MatchDTO[]>();
    for (const m of matches) {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round)!.push(m);
    }
    return [...byRound.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  return (
    <section className={`rounded-2xl border ${style.border} ${style.bg} p-4 mb-4`}>
      <h2 className={`font-display uppercase font-bold text-lg mb-3 ${style.text}`}>{FRIENDLY_LABELS[bracket]}</h2>
      {rounds.map(([round, ms]) => (
        <div key={round} className="mb-3 last:mb-0">
          <p className="text-white/40 text-[10px] uppercase tracking-widest mb-1">
            {["NE", "SE", "NW", "SW"].includes(bracket) ? "Playoff Match" : ms[0].roundName}
          </p>
          {ms
            .sort((a, b) => a.posIndex - b.posIndex)
            .map((m) => (
              <MatchLine key={m.id} match={m} />
            ))}
        </div>
      ))}
    </section>
  );
}

function RoundRobinContent({ snapshot }: { snapshot: NonNullable<ReturnType<typeof useCompassStore.getState>["snapshot"]> }) {
  const standings = computeStandings(snapshot.matches);
  const matches = [...snapshot.matches].sort((a, b) => a.posIndex - b.posIndex);

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-16">
      <header className="text-center mb-4 sticky top-0 bg-court-bg/95 backdrop-blur py-3 -mx-4 px-4 z-10">
        <div className="flex justify-center mb-2">
          <ClubLogo size={36} />
        </div>
        <h1 className="font-display text-xl uppercase font-bold mb-2">Live Group &amp; Results</h1>
        <p className="text-white/40 text-xs">
          {snapshot.progress.completed} of {snapshot.progress.total} matches complete
        </p>
      </header>

      <section className="rounded-2xl border border-court-line bg-court-panel p-4 mb-4">
        <h2 className="font-display uppercase font-bold text-lg mb-3 text-gold">Standings</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/40 text-left uppercase text-xs">
              <th className="pb-2 pr-2">#</th>
              <th className="pb-2">Team</th>
              <th className="pb-2 px-1.5 text-center">Wins</th>
              <th className="pb-2 px-1.5 text-center">Losses</th>
              <th className="pb-2 px-1.5 text-center">Points</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((r, i) => (
              <tr key={r.name} className="border-t border-white/5">
                <td className="py-1.5 pr-2 text-white/40 font-mono">{i + 1}</td>
                <td className="py-1.5 truncate">{r.name}</td>
                <td className="py-1.5 px-1.5 text-center text-gold font-bold">{r.won}</td>
                <td className="py-1.5 px-1.5 text-center text-white/50">{r.lost}</td>
                <td className="py-1.5 px-1.5 text-center tabular-nums">{r.pointsFor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-court-line bg-court-panel p-4 mb-4">
        <h2 className="font-display uppercase font-bold text-lg mb-1 text-gold">All matches</h2>
        {matches.map((m) => (
          <MatchLine key={m.id} match={m} />
        ))}
      </section>

      <div className="text-center mt-6 flex items-center justify-center gap-3 flex-wrap">
        <Link href="/" className="text-white/30 text-xs underline underline-offset-4">
          Back home
        </Link>
        <span className="text-white/15 text-xs">·</span>
        <Link href="/results" className="text-white/30 text-xs underline underline-offset-4">
          Printable results
        </Link>
      </div>
    </main>
  );
}

function TwoGroupContent({ snapshot }: { snapshot: NonNullable<ReturnType<typeof useCompassStore.getState>["snapshot"]> }) {
  const knockout = snapshot.matches
    .filter((m) => m.bracket === "SF" || m.bracket === "F")
    .sort((a, b) => (a.bracket === b.bracket ? a.posIndex - b.posIndex : a.bracket === "SF" ? -1 : 1));

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-16">
      <header className="text-center mb-4 sticky top-0 bg-court-bg/95 backdrop-blur py-3 -mx-4 px-4 z-10">
        <div className="flex justify-center mb-2">
          <ClubLogo size={36} />
        </div>
        <h1 className="font-display text-xl uppercase font-bold mb-2">Live Groups &amp; Knockout</h1>
        <p className="text-white/40 text-xs">
          {snapshot.progress.completed} of {snapshot.progress.total} matches complete
        </p>
      </header>

      {(["GA", "GB"] as BracketCode[]).map((bracket) => {
        const groupMatches = snapshot.matches.filter((m) => m.bracket === bracket);
        const table = computeStandings(groupMatches);
        const style = BRACKET_STYLE[bracket];
        return (
          <section key={bracket} className={`rounded-2xl border ${style.border} ${style.bg} p-4 mb-4`}>
            <h2 className={`font-display uppercase font-bold text-lg mb-3 ${style.text}`}>{FRIENDLY_LABELS[bracket]}</h2>
            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="text-white/40 text-left uppercase text-xs">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2">Team</th>
                  <th className="pb-2 px-1.5 text-center">Wins</th>
                  <th className="pb-2 px-1.5 text-center">Losses</th>
                  <th className="pb-2 px-1.5 text-center">Points</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r, i) => (
                  <tr key={r.id} className={`border-t border-white/5 ${i < 2 ? "text-gold" : ""}`}>
                    <td className="py-1.5 pr-2 font-mono opacity-60">{i + 1}</td>
                    <td className="py-1.5 truncate">{r.name}</td>
                    <td className="py-1.5 px-1.5 text-center font-bold">{r.won}</td>
                    <td className="py-1.5 px-1.5 text-center opacity-60">{r.lost}</td>
                    <td className="py-1.5 px-1.5 text-center tabular-nums">{r.pointsFor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1">Group matches</p>
            {groupMatches
              .sort((a, b) => a.posIndex - b.posIndex)
              .map((m) => (
                <MatchLine key={m.id} match={m} />
              ))}
          </section>
        );
      })}

      <section className="rounded-2xl border border-gold/40 bg-gold/5 p-4 mb-4">
        <h2 className="font-display uppercase font-bold text-lg mb-1 text-gold">Knockout</h2>
        <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1">Top two of each group · A1 v B2, B1 v A2</p>
        {knockout.map((m) => (
          <div key={m.id}>
            <p className="text-white/40 text-[10px] uppercase tracking-widest mt-2">{m.roundName}</p>
            <MatchLine match={m} />
          </div>
        ))}
      </section>

      <div className="text-center mt-6 flex items-center justify-center gap-3 flex-wrap">
        <Link href="/" className="text-white/30 text-xs underline underline-offset-4">
          Back home
        </Link>
        <span className="text-white/15 text-xs">·</span>
        <Link href="/results" className="text-white/30 text-xs underline underline-offset-4">
          Printable results
        </Link>
      </div>
    </main>
  );
}

function BracketContent() {
  const snapshot = useCompassStore((s) => s.snapshot)!;
  const [filter, setFilter] = useState<BracketCode | "ALL">("ALL");

  if (snapshot.tournament.status === "setup") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-white/50">Tournament hasn&apos;t started yet.</p>
      </div>
    );
  }

  if (snapshot.tournament.format === "two-group") {
    return <TwoGroupContent snapshot={snapshot} />;
  }

  if (snapshot.tournament.format === "round-robin") {
    return <RoundRobinContent snapshot={snapshot} />;
  }

  const visibleBrackets = filter === "ALL" ? ALL_BRACKETS : [filter];

  return (
    <main className="min-h-screen p-4 max-w-lg mx-auto pb-16">
      <header className="text-center mb-4 sticky top-0 bg-court-bg/95 backdrop-blur py-3 -mx-4 px-4 z-10">
        <div className="flex justify-center mb-2">
          <ClubLogo size={36} />
        </div>
        <h1 className="font-display text-xl uppercase font-bold mb-2">Live Bracket &amp; Results</h1>
        <p className="text-white/40 text-xs">
          {snapshot.progress.completed} of {snapshot.progress.total} matches complete
        </p>
      </header>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4 pb-1">
        <button
          onClick={() => setFilter("ALL")}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-display uppercase border ${
            filter === "ALL" ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/50"
          }`}
        >
          All
        </button>
        {ALL_BRACKETS.map((b) => (
          <button
            key={b}
            onClick={() => setFilter(b)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-display uppercase border ${
              filter === b ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/50"
            }`}
          >
            {FRIENDLY_LABELS[b]}
          </button>
        ))}
      </div>

      {visibleBrackets.map((b) => (
        <BracketSection key={b} bracket={b} matches={snapshot.matches.filter((m) => m.bracket === b)} />
      ))}

      <div className="text-center mt-6 flex items-center justify-center gap-3 flex-wrap">
        <Link href="/" className="text-white/30 text-xs underline underline-offset-4">
          Back home
        </Link>
        <span className="text-white/15 text-xs">·</span>
        <Link href="/draw" className="text-white/30 text-xs underline underline-offset-4">
          Full draw sheet
        </Link>
        <span className="text-white/15 text-xs">·</span>
        <Link href="/results" className="text-white/30 text-xs underline underline-offset-4">
          Printable results
        </Link>
      </div>
    </main>
  );
}

export default function PublicBracketPage() {
  return (
    <ConnectionGate>
      <BracketContent />
    </ConnectionGate>
  );
}
