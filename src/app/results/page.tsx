"use client";

import Link from "next/link";
import ConnectionGate from "@/components/shared/ConnectionGate";
import ClubLogo from "@/components/shared/ClubLogo";
import { useCompassStore } from "@/store/useCompassStore";
import { getCrownedChampions } from "@/lib/tournamentStats";
import { computeStandings } from "@/lib/standings";
import { formatMatchScoreLine } from "@/lib/scoring/format";
import { MatchDTO } from "@/lib/types";

function ResultsContent() {
  const snapshot = useCompassStore((s) => s.snapshot)!;

  if (snapshot.tournament.status === "setup") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-white text-slate-900">
        <p>Tournament hasn&apos;t started yet.</p>
      </div>
    );
  }

  const printedAt = new Date().toLocaleString();
  const isRoundRobin = snapshot.tournament.format === "round-robin";
  const isTwoGroup = snapshot.tournament.format === "two-group";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="max-w-2xl mx-auto px-6 py-10 print:py-4">
        <div className="no-print flex items-center justify-between mb-8">
          <Link href="/" className="text-slate-400 text-sm underline underline-offset-4">
            Back home
          </Link>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-slate-900 text-white font-semibold text-sm px-4 py-2"
          >
            Print / Save as PDF
          </button>
        </div>

        <header className="text-center mb-10 border-b border-slate-200 pb-6">
          <div className="flex justify-center mb-3">
            <ClubLogo size={44} onLight />
          </div>
          <p className="uppercase tracking-[0.3em] text-slate-400 text-xs mb-2">
            {isTwoGroup ? "Two Groups · Semifinals · Final" : isRoundRobin ? "Round Robin Group" : "Compass Draw Tournament"}
          </p>
          <h1 className="text-3xl font-bold uppercase tracking-tight">Final Results</h1>
          <p className="text-slate-400 text-xs mt-2">
            {snapshot.progress.completed} of {snapshot.progress.total} matches complete
          </p>
        </header>

        {isTwoGroup ? (
          <TwoGroupResults matches={snapshot.matches} />
        ) : isRoundRobin ? (
          <RoundRobinResults matches={snapshot.matches} />
        ) : (
          <CompassResults matches={snapshot.matches} />
        )}

        <footer className="mt-10 pt-4 border-t border-slate-200 text-center text-slate-300 text-xs">
          Generated {printedAt}
        </footer>
      </div>

      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function GroupTable({ matches, label }: { matches: MatchDTO[]; label: string }) {
  const standings = computeStandings(matches);
  return (
    <div>
      <h3 className="uppercase tracking-widest text-slate-400 text-xs font-bold mb-3">{label}</h3>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr className="text-slate-400 text-left uppercase text-xs border-b border-slate-200">
            <th className="py-2 pr-2">#</th>
            <th className="py-2">Team</th>
            <th className="py-2 px-2 text-center">Played</th>
            <th className="py-2 px-2 text-center">Wins</th>
            <th className="py-2 px-2 text-center">Losses</th>
            <th className="py-2 px-2 text-center">Points</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((r, i) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="py-2 pr-2 text-slate-400 font-mono">{i + 1}</td>
              <td className={`py-2 ${i < 2 ? "font-bold" : "font-semibold"}`}>
                {r.name}
                {i < 2 && <span className="text-amber-600 text-xs font-normal"> · qualified</span>}
              </td>
              <td className="py-2 px-2 text-center">{r.played}</td>
              <td className="py-2 px-2 text-center font-bold">{r.won}</td>
              <td className="py-2 px-2 text-center text-slate-400">{r.lost}</td>
              <td className="py-2 px-2 text-center tabular-nums">
                {r.pointsFor}
                <span className="text-slate-300">-{r.pointsAgainst}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TwoGroupResults({ matches }: { matches: MatchDTO[] }) {
  const final = matches.find((m) => m.bracket === "F");
  const semis = matches.filter((m) => m.bracket === "SF").sort((a, b) => a.posIndex - b.posIndex);
  const nameOf = (m: MatchDTO | undefined, which: "winner" | "loser") => {
    if (!m) return null;
    const id = which === "winner" ? m.winnerId : m.loserId;
    if (!id) return null;
    return m.player1?.id === id ? m.player1?.name ?? null : m.player2?.name ?? null;
  };
  const champion = nameOf(final, "winner");
  const runnerUp = nameOf(final, "loser");

  return (
    <>
      <section className="text-center mb-10 rounded-2xl border-2 border-amber-400 bg-amber-50 py-8 px-6">
        <p className="uppercase tracking-widest text-amber-600 text-xs font-bold mb-2">🏆 Champion</p>
        {champion ? (
          <>
            <h2 className="text-4xl font-bold">{champion}</h2>
            {runnerUp && <p className="text-slate-500 mt-1">Beat {runnerUp} in the final</p>}
          </>
        ) : (
          <p className="text-slate-400 text-lg">Not yet decided</p>
        )}
      </section>

      <section className="mb-10">
        <h3 className="uppercase tracking-widest text-slate-400 text-xs font-bold mb-4 text-center">Knockout</h3>
        {[...semis, ...(final ? [final] : [])].map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm">
            <span className="text-slate-400 w-24 shrink-0 uppercase text-xs tracking-wide">{m.roundName}</span>
            <span className="flex-1 min-w-0 truncate">
              {m.player1?.name ?? "TBD"} <span className="text-slate-300">v</span> {m.player2?.name ?? "TBD"}
            </span>
            <span className="font-mono text-xs text-slate-500 shrink-0">
              {m.status === "completed" ? formatMatchScoreLine(m) : "—"}
            </span>
          </div>
        ))}
      </section>

      <GroupTable matches={matches.filter((m) => m.bracket === "GA")} label="Group A" />
      <GroupTable matches={matches.filter((m) => m.bracket === "GB")} label="Group B" />
    </>
  );
}

function RoundRobinResults({ matches }: { matches: MatchDTO[] }) {
  const standings = computeStandings(matches);
  const allDone = matches.length > 0 && matches.every((m) => m.status === "completed");
  const champion = allDone ? standings[0] : undefined;
  return (
    <>
      <section className="text-center mb-10 rounded-2xl border-2 border-amber-400 bg-amber-50 py-8 px-6">
        <p className="uppercase tracking-widest text-amber-600 text-xs font-bold mb-2">🏆 Group Winner</p>
        {champion ? (
          <>
            <h2 className="text-4xl font-bold">{champion.name}</h2>
            <p className="text-slate-500 mt-1">
              {champion.won}W-{champion.lost}L · {champion.pointsFor} points scored
            </p>
          </>
        ) : (
          <p className="text-slate-400 text-lg">Not yet decided</p>
        )}
      </section>

      <section>
        <h3 className="uppercase tracking-widest text-slate-400 text-xs font-bold mb-4 text-center">Standings</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-slate-400 text-left uppercase text-xs border-b border-slate-200">
              <th className="py-2 pr-2">#</th>
              <th className="py-2">Team</th>
              <th className="py-2 px-2 text-center">Played</th>
              <th className="py-2 px-2 text-center">Wins</th>
              <th className="py-2 px-2 text-center">Losses</th>
              <th className="py-2 px-2 text-center">Points</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((r, i) => (
              <tr key={r.name} className="border-b border-slate-100">
                <td className="py-2 pr-2 text-slate-400 font-mono">{i + 1}</td>
                <td className="py-2 font-semibold">{r.name}</td>
                <td className="py-2 px-2 text-center">{r.played}</td>
                <td className="py-2 px-2 text-center font-bold">{r.won}</td>
                <td className="py-2 px-2 text-center text-slate-400">{r.lost}</td>
                <td className="py-2 px-2 text-center tabular-nums">
                  {r.pointsFor}
                  <span className="text-slate-300">-{r.pointsAgainst}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function CompassResults({ matches }: { matches: MatchDTO[] }) {
  const champions = getCrownedChampions(matches);
  const eastChampion = champions.find((c) => c.bracket === "E")!;
  const others = champions.filter((c) => c.bracket !== "E");
  return (
    <>
      <section className="text-center mb-10 rounded-2xl border-2 border-amber-400 bg-amber-50 py-8 px-6">
        <p className="uppercase tracking-widest text-amber-600 text-xs font-bold mb-2">🏆 Tournament Champion (East)</p>
        {eastChampion.championName ? (
          <>
            <h2 className="text-4xl font-bold">{eastChampion.championName}</h2>
            <p className="text-slate-500 mt-1">def. {eastChampion.runnerUpName} in the East Final</p>
          </>
        ) : (
          <p className="text-slate-400 text-lg">Not yet decided</p>
        )}
      </section>

      <section>
        <h3 className="uppercase tracking-widest text-slate-400 text-xs font-bold mb-4 text-center">
          Direction Champions
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {others.map((c) => (
            <div key={c.bracket} className="rounded-xl border border-slate-200 p-4">
              <p className="uppercase text-xs font-bold text-slate-400 mb-1">{c.label}</p>
              {c.championName ? (
                <>
                  <p className="font-bold text-lg">{c.championName}</p>
                  <p className="text-slate-400 text-sm">def. {c.runnerUpName}</p>
                </>
              ) : (
                <p className="text-slate-300 text-sm">Not yet decided</p>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function ResultsPage() {
  return (
    <ConnectionGate>
      <ResultsContent />
    </ConnectionGate>
  );
}
