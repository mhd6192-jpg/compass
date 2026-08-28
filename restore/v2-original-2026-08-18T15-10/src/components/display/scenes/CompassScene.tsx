"use client";

import { BRACKET_LABELS, BracketCode, MatchDTO } from "@/lib/types";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import { ClubMark } from "@/components/shared/ClubLogo";

const ARROWS: Record<BracketCode, string> = {
  NW: "↖",
  N: "↑",
  NE: "↗",
  W: "←",
  E: "→",
  SW: "↙",
  S: "↓",
  SE: "↘",
  RR: "◎",
};

function DirectionCell({ bracket, matches }: { bracket: BracketCode; matches: MatchDTO[] }) {
  const style = BRACKET_STYLE[bracket];
  const bm = matches.filter((m) => m.bracket === bracket).sort((a, b) => a.round - b.round || a.posIndex - b.posIndex);
  const done = bm.filter((m) => m.status === "completed").length;
  const final = bm.find((m) => m.isBracketFinal);
  const champion =
    final?.status === "completed" ? (final.winnerId === final.player1?.id ? final.player1?.name : final.player2?.name) ?? null : null;
  const liveMatch = bm.find((m) => m.status === "in_progress");
  const upcoming = liveMatch ?? bm.find((m) => m.status === "scheduled" || m.status === "ready");
  const isMainDraw = bracket === "E";

  return (
    <div
      className={`relative rounded-xl border p-3 flex flex-col justify-between min-h-[88px] overflow-hidden ${style.border} ${style.bg} ${
        isMainDraw ? `ring-1 ${style.ring}` : ""
      } ${liveMatch ? "animate-ring-pulse" : ""}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={`font-display uppercase font-bold flex items-center gap-1.5 ${style.text} ${isMainDraw ? "text-lg" : "text-sm"}`}>
          <span className="opacity-70">{ARROWS[bracket]}</span>
          {BRACKET_LABELS[bracket]}
          {isMainDraw && <span className="text-[9px] font-normal tracking-widest text-white/40 ml-1">MAIN DRAW</span>}
        </span>
        <span className="text-[10px] text-white/35 font-mono shrink-0">
          {done}/{bm.length}
        </span>
      </div>
      {champion ? (
        <p className="text-gold font-display font-bold text-sm truncate">🏆 {champion}</p>
      ) : upcoming ? (
        <p className="text-white/70 text-xs truncate flex items-center gap-1.5">
          {liveMatch && <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse shrink-0" />}
          {upcoming.player1?.name ?? "TBD"} <span className="text-white/30">v</span> {upcoming.player2?.name ?? "TBD"}
        </p>
      ) : (
        <p className="text-white/25 text-xs">Not started</p>
      )}
    </div>
  );
}

export default function CompassScene({
  matches,
  progress,
}: {
  matches: MatchDTO[];
  progress: { completed: number; total: number };
}) {
  const pct = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  return (
    <div className="flex-1 flex flex-col justify-center">
      <div className="grid grid-cols-3 gap-2.5 max-w-4xl mx-auto w-full">
        <DirectionCell bracket="NW" matches={matches} />
        <DirectionCell bracket="N" matches={matches} />
        <DirectionCell bracket="NE" matches={matches} />

        <DirectionCell bracket="W" matches={matches} />
        <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-pine-deep/60 to-court-panel flex flex-col items-center justify-center gap-1.5 py-3">
          <ClubMark size={34} />
          <p className="font-display uppercase tracking-[0.3em] text-gold text-[10px]">Compass Draw</p>
          <div className="w-24 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gold rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-white/40 text-[10px] font-mono">
            {progress.completed}/{progress.total} matches
          </p>
        </div>
        <DirectionCell bracket="E" matches={matches} />

        <DirectionCell bracket="SW" matches={matches} />
        <DirectionCell bracket="S" matches={matches} />
        <DirectionCell bracket="SE" matches={matches} />
      </div>
    </div>
  );
}
