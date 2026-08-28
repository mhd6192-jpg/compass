"use client";

import { BracketCode, MatchDTO } from "@/lib/types";
import { BRACKET_STYLE } from "@/lib/bracketStyle";

type TreeSize = "sm" | "md";

const NODE_WIDTH: Record<TreeSize, string> = { sm: "w-[138px]", md: "w-[172px]" };

function scoreCells(match: MatchDTO, i: 0 | 1): string[] {
  const st = match.state;
  const cells = st.completedSets.map((s) => String(s.games[i]));
  if (match.status !== "completed" && st.currentSet && (match.status === "in_progress" || st.totalPoints > 0)) {
    cells.push(String(st.currentSet.games[i]));
  }
  return cells.slice(-3);
}

function PlayerRow({ match, slot, size }: { match: MatchDTO; slot: 1 | 2; size: TreeSize }) {
  const player = slot === 1 ? match.player1 : match.player2;
  const isWinner = !!match.winnerId && player?.id === match.winnerId;
  const isLoser = !!match.winnerId && !!player && player.id !== match.winnerId;
  const live = match.status === "in_progress";
  const cells = scoreCells(match, (slot - 1) as 0 | 1);
  const pt = live ? match.state.currentGame?.display[slot - 1] : null;

  return (
    <div className={`flex items-center gap-1 ${size === "sm" ? "text-[11px]" : "text-xs"} leading-tight`}>
      <span
        className={`flex-1 min-w-0 truncate font-display uppercase ${
          isWinner ? "text-gold font-bold" : isLoser ? "text-white/30" : player ? "text-white/80" : "text-white/25 italic"
        }`}
      >
        {player?.name ?? "TBD"}
      </span>
      {cells.map((c, idx) => (
        <span key={idx} className="w-3 text-center font-mono text-white/45 tabular-nums shrink-0">
          {c}
        </span>
      ))}
      {pt != null && <span className="w-6 text-center font-mono font-bold text-gold tabular-nums shrink-0">{pt}</span>}
    </div>
  );
}

export function BracketMatchNode({ match, size = "sm" }: { match: MatchDTO | undefined; size?: TreeSize }) {
  if (!match) return <div className={`${NODE_WIDTH[size]} h-10`} />;
  const live = match.status === "in_progress";
  return (
    <div
      className={`relative ${NODE_WIDTH[size]} rounded-md border px-2 ${size === "sm" ? "py-1" : "py-1.5"} flex flex-col gap-0.5 bg-court-panel ${
        live ? "border-gold/70 animate-ring-pulse" : match.status === "completed" ? "border-court-line" : "border-court-line/70"
      }`}
    >
      {live && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-live animate-pulse" />}
      <PlayerRow match={match} slot={1} size={size} />
      <PlayerRow match={match} slot={2} size={size} />
    </div>
  );
}

/**
 * Full single-elimination bracket tree with connector lines, built recursively
 * from the final backwards (match at round r, pos p is fed by (r-1, 2p) and
 * (r-1, 2p+1)). Pure CSS connectors: horizontal stubs out of each feeder, one
 * vertical joiner between the pair, and a stub into the parent.
 */
export default function BracketTree({
  matches,
  bracket,
  size = "sm",
  roundLabels,
}: {
  matches: MatchDTO[];
  bracket: BracketCode;
  size?: TreeSize;
  roundLabels?: string[];
}) {
  const style = BRACKET_STYLE[bracket];
  const map = new Map(matches.map((m) => [`${m.round}-${m.posIndex}`, m]));
  const totalRounds = matches.length ? Math.max(...matches.map((m) => m.round)) : 1;
  const lineCls = "bg-white/20";

  const finalMatch = map.get(`${totalRounds}-0`);
  const champion =
    finalMatch?.status === "completed" && finalMatch.winnerId
      ? (finalMatch.winnerId === finalMatch.player1?.id ? finalMatch.player1?.name : finalMatch.player2?.name) ?? null
      : null;

  function Sub({ round, pos }: { round: number; pos: number }): React.ReactElement {
    const node = <BracketMatchNode match={map.get(`${round}-${pos}`)} size={size} />;
    if (round === 1) return node;
    return (
      <div className="flex items-center">
        <div className="relative flex flex-col gap-1.5">
          <div className="relative flex items-center pr-4">
            <Sub round={round - 1} pos={pos * 2} />
            <span className={`absolute right-0 top-1/2 w-4 h-px ${lineCls}`} />
          </div>
          <div className="relative flex items-center pr-4">
            <Sub round={round - 1} pos={pos * 2 + 1} />
            <span className={`absolute right-0 top-1/2 w-4 h-px ${lineCls}`} />
          </div>
          <span className={`absolute right-0 top-1/4 bottom-1/4 w-px ${lineCls}`} />
        </div>
        <span className={`w-4 h-px ${lineCls}`} />
        {node}
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-start gap-2">
      {roundLabels && (
        <div className="flex" style={{ gap: 32 }}>
          {roundLabels.slice(0, totalRounds).map((label) => (
            <p
              key={label}
              className={`${NODE_WIDTH[size]} text-center font-display uppercase tracking-widest text-[9px] ${style.text} opacity-80`}
            >
              {label}
            </p>
          ))}
        </div>
      )}
      <div className="flex items-center">
        <Sub round={totalRounds} pos={0} />
        {champion && (
          <>
            <span className={`w-4 h-px ${lineCls}`} />
            <div className="rounded-md border border-gold bg-gold/10 px-2.5 py-1.5">
              <p className="text-[9px] uppercase tracking-widest text-gold/70 font-display">Champion</p>
              <p className="font-display font-bold uppercase text-gold text-sm whitespace-nowrap">🏆 {champion}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
