"use client";

import Link from "next/link";
import ConnectionGate from "@/components/shared/ConnectionGate";
import ClubLogo from "@/components/shared/ClubLogo";
import ButterflyDraw from "@/components/display/ButterflyDraw";
import BracketTree, { BracketMatchNode } from "@/components/display/BracketTree";
import RoundRobinStandings from "@/components/display/RoundRobinStandings";
import { BRACKET_LABELS, BracketCode, MatchDTO } from "@/lib/types";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import { useCompassStore } from "@/store/useCompassStore";

function CornerBlock({ bracket, matches, note }: { bracket: BracketCode; matches: MatchDTO[]; note: string }) {
  const style = BRACKET_STYLE[bracket];
  const m = matches.find((x) => x.bracket === bracket);
  const champion =
    m?.status === "completed" && m.winnerId ? (m.winnerId === m.player1?.id ? m.player1?.name : m.player2?.name) ?? null : null;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className={`font-display font-bold uppercase tracking-widest text-sm ${style.text}`}>{BRACKET_LABELS[bracket]}</p>
      <BracketMatchNode match={m} size="sm" />
      {champion ? (
        <p className="text-gold font-display font-bold text-xs">🏆 {champion}</p>
      ) : (
        <p className="text-white/25 text-[10px] uppercase tracking-wide">{note}</p>
      )}
    </div>
  );
}

function MiddleTreeBlock({ bracket, matches, note }: { bracket: BracketCode; matches: MatchDTO[]; note: string }) {
  const style = BRACKET_STYLE[bracket];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className={`font-display font-bold uppercase tracking-widest text-base ${style.text}`}>{BRACKET_LABELS[bracket]}</p>
      <BracketTree matches={matches.filter((m) => m.bracket === bracket)} bracket={bracket} size="sm" roundLabels={["Round 1", "Final"]} />
      <p className="text-white/25 text-[10px] uppercase tracking-wide">{note}</p>
    </div>
  );
}

function DrawContent() {
  const snapshot = useCompassStore((s) => s.snapshot)!;

  if (snapshot.tournament.status === "setup") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-white/50">Tournament hasn&apos;t started yet.</p>
      </div>
    );
  }

  const matches = snapshot.matches;

  if (snapshot.tournament.format === "two-group") {
    return (
      <main className="min-h-screen p-4 sm:p-6 flex flex-col items-center gap-6 max-w-lg mx-auto">
        <header className="text-center flex flex-col items-center gap-2">
          <ClubLogo size={44} />
          <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-wide">Two Groups</h1>
          <p className="text-white/40 text-xs">
            {snapshot.progress.completed} of {snapshot.progress.total} matches complete
          </p>
        </header>
        <RoundRobinStandings matches={matches.filter((m) => m.bracket === "GA")} title="Group A" note="Top two qualify" />
        <RoundRobinStandings matches={matches.filter((m) => m.bracket === "GB")} title="Group B" note="Top two qualify" />
        <footer className="flex items-center gap-3 pb-6">
          <Link href="/" className="text-white/30 text-xs underline underline-offset-4">
            Back home
          </Link>
          <span className="text-white/15 text-xs">·</span>
          <Link href="/bracket" className="text-white/30 text-xs underline underline-offset-4">
            Match list
          </Link>
          <span className="text-white/15 text-xs">·</span>
          <Link href="/results" className="text-white/30 text-xs underline underline-offset-4">
            Printable results
          </Link>
        </footer>
      </main>
    );
  }

  if (snapshot.tournament.format === "round-robin") {
    return (
      <main className="min-h-screen p-4 sm:p-6 flex flex-col items-center gap-6 max-w-lg mx-auto">
        <header className="text-center flex flex-col items-center gap-2">
          <ClubLogo size={44} />
          <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-wide">Round Robin Group</h1>
          <p className="text-white/40 text-xs">
            {snapshot.progress.completed} of {snapshot.progress.total} matches complete
          </p>
        </header>
        <RoundRobinStandings matches={matches} />
        <footer className="flex items-center gap-3 pb-6">
          <Link href="/" className="text-white/30 text-xs underline underline-offset-4">
            Back home
          </Link>
          <span className="text-white/15 text-xs">·</span>
          <Link href="/bracket" className="text-white/30 text-xs underline underline-offset-4">
            Match list
          </Link>
          <span className="text-white/15 text-xs">·</span>
          <Link href="/results" className="text-white/30 text-xs underline underline-offset-4">
            Printable results
          </Link>
        </footer>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-6 flex flex-col items-center gap-8">
      <header className="text-center flex flex-col items-center gap-2">
        <ClubLogo size={44} />
        <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-wide">16-Player Compass Draw</h1>
        <p className="text-white/40 text-xs">
          {snapshot.progress.completed} of {snapshot.progress.total} matches complete
        </p>
      </header>

      {/* top band: Northwest | North | Northeast */}
      <section className="w-full max-w-6xl flex items-end justify-center gap-10 sm:gap-16 flex-wrap">
        <CornerBlock bracket="NW" matches={matches} note="North R1 losers" />
        <MiddleTreeBlock bracket="N" matches={matches} note="East QF losers drop here" />
        <CornerBlock bracket="NE" matches={matches} note="East SF losers" />
      </section>

      {/* central butterfly: West ← Round of 16 spine → East */}
      <section className="w-full overflow-x-auto no-scrollbar">
        <div className="min-w-max mx-auto px-4">
          <ButterflyDraw matches={matches} rowH={52} />
        </div>
      </section>

      {/* bottom band: Southwest | South | Southeast */}
      <section className="w-full max-w-6xl flex items-start justify-center gap-10 sm:gap-16 flex-wrap">
        <CornerBlock bracket="SW" matches={matches} note="South R1 losers" />
        <MiddleTreeBlock bracket="S" matches={matches} note="West R1 losers drop here" />
        <CornerBlock bracket="SE" matches={matches} note="West SF losers" />
      </section>

      <footer className="flex items-center gap-3 pb-6">
        <Link href="/" className="text-white/30 text-xs underline underline-offset-4">
          Back home
        </Link>
        <span className="text-white/15 text-xs">·</span>
        <Link href="/bracket" className="text-white/30 text-xs underline underline-offset-4">
          Mobile bracket list
        </Link>
        <span className="text-white/15 text-xs">·</span>
        <Link href="/results" className="text-white/30 text-xs underline underline-offset-4">
          Printable results
        </Link>
      </footer>
    </main>
  );
}

export default function DrawPage() {
  return (
    <ConnectionGate>
      <DrawContent />
    </ConnectionGate>
  );
}
