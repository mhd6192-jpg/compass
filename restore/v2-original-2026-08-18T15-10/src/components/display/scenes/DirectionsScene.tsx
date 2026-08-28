"use client";

import { BRACKET_LABELS, BracketCode, MatchDTO } from "@/lib/types";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import BracketTree, { BracketMatchNode } from "@/components/display/BracketTree";

function TreeBlock({ bracket, matches, roundLabels }: { bracket: BracketCode; matches: MatchDTO[]; roundLabels: string[] }) {
  const style = BRACKET_STYLE[bracket];
  const bm = matches.filter((m) => m.bracket === bracket);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className={`font-display uppercase tracking-[0.25em] text-[11px] ${style.text}`}>{BRACKET_LABELS[bracket]}</p>
      <BracketTree matches={bm} bracket={bracket} size="sm" roundLabels={roundLabels} />
    </div>
  );
}

function SingleFinal({ bracket, matches }: { bracket: BracketCode; matches: MatchDTO[] }) {
  const style = BRACKET_STYLE[bracket];
  const m = matches.find((x) => x.bracket === bracket);
  const champion =
    m?.status === "completed" && m.winnerId ? (m.winnerId === m.player1?.id ? m.player1?.name : m.player2?.name) ?? null : null;
  return (
    <div className={`rounded-xl border p-2.5 flex flex-col gap-1.5 ${style.border} ${style.bg}`}>
      <p className={`font-display uppercase tracking-[0.2em] text-[10px] ${style.text}`}>{BRACKET_LABELS[bracket]}</p>
      <BracketMatchNode match={m} size="sm" />
      {champion && <p className="text-gold font-display font-bold text-xs truncate">🏆 {champion}</p>}
    </div>
  );
}

export default function DirectionsScene({ matches }: { matches: MatchDTO[] }) {
  return (
    <div className="flex-1 flex flex-col justify-center gap-5 min-h-0">
      <div className="flex justify-center items-start gap-10 flex-wrap">
        <TreeBlock bracket="N" matches={matches} roundLabels={["Round 1", "Final"]} />
        <TreeBlock bracket="S" matches={matches} roundLabels={["Round 1", "Final"]} />
      </div>
      <div className="flex justify-center gap-3 flex-wrap">
        <SingleFinal bracket="NE" matches={matches} />
        <SingleFinal bracket="SE" matches={matches} />
        <SingleFinal bracket="NW" matches={matches} />
        <SingleFinal bracket="SW" matches={matches} />
      </div>
    </div>
  );
}
