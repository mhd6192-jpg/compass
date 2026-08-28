"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { MatchDTO } from "@/lib/types";
import { computeStandings, findDecider, type StandingsRow } from "@/lib/standings";

// Bounds for the auto-fitted type size on the TV. The low end only gets used by
// very large groups in a very short panel; the high end keeps small groups from
// looking comical.
const MAX_FONT = 26;
const MIN_FONT = 8;
// Below roughly this row height nobody reads the table from across the court, so
// the roster spills into another column instead of shrinking further.
const MIN_ROW_PX = 26;
const HEAD_PX = 30;
const MAX_COLS = 3;

/** Columns needed to keep every team on screen at a readable row height. */
function wantedCols(rows: number, avail: number): number {
  for (let c = 1; c < MAX_COLS; c++) {
    if (Math.ceil(rows / c) * MIN_ROW_PX + HEAD_PX <= avail) return c;
  }
  return MAX_COLS;
}

function Table({ rows, offset, final }: { rows: StandingsRow[]; offset: number; final: boolean }) {
  return (
    <table className="w-full">
      <thead>
        {/* Spelled out rather than P/W/L — spectators read this from across the court. */}
        <tr className="text-white/60 text-left uppercase text-[0.5em] tracking-[0.12em]">
          <th className="pb-[0.6em] pr-[0.6em]">#</th>
          <th className="pb-[0.6em]">Team</th>
          <th className="pb-[0.6em] px-[0.5em] text-center">Played</th>
          <th className="pb-[0.6em] px-[0.5em] text-center">Wins</th>
          <th className="pb-[0.6em] px-[0.5em] text-center">Losses</th>
          <th className="pb-[0.6em] px-[0.5em] text-center">Points</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const rank = offset + i;
          const leader = final && rank === 0;
          return (
            <tr key={r.id} className={`border-t border-white/10 ${leader ? "bg-gold/10" : ""}`}>
              <td className={`py-[0.4em] pr-[0.3em] font-mono ${leader ? "text-gold" : "text-white/50"}`}>{rank + 1}</td>
              <td className={`py-[0.4em] font-display uppercase ${leader ? "text-gold font-bold" : "text-white"}`}>{r.name}</td>
              <td className="py-[0.4em] px-[0.25em] text-center text-white/80">{r.played}</td>
              <td className="py-[0.4em] px-[0.25em] text-center text-gold font-bold">{r.won}</td>
              <td className="py-[0.4em] px-[0.25em] text-center text-white/70">{r.lost}</td>
              <td className="py-[0.4em] px-[0.25em] text-center tabular-nums text-white/90">
                {r.pointsFor}
                <span className="hidden sm:inline text-white/40">-{r.pointsAgainst}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function RoundRobinStandings({
  matches,
  title = "Standings",
  final = false,
  autoFit = false,
  note,
}: {
  matches: MatchDTO[];
  /** Heading above the table — the finished view calls it "Final Standings". */
  title?: string;
  /** Every match played: rank 1 gets the winner's treatment. */
  final?: boolean;
  /** Size the type to the height available so every team fits (TV display only —
   * needs a parent that constrains height, otherwise there is nothing to fit to). */
  autoFit?: boolean;
  /** Overrides the caption beside the heading (e.g. "Top two qualify"). */
  note?: string;
}) {
  const standings = computeStandings(matches);
  const boxRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);

  // Nobody scrolls a TV, so a table that doesn't fit just loses its bottom rows.
  // Two passes: spread the roster over enough columns to keep rows readable, then
  // binary-search the largest type size that still fits. Row padding is in `em`,
  // so the whole table scales off that one number.
  const roster = `${standings.length}|${standings.map((r) => r.name).join("|")}`;
  useLayoutEffect(() => {
    if (!autoFit) return;
    const box = boxRef.current;
    const grid = gridRef.current;
    if (!box || !grid) return;

    const measure = () => {
      const avail = box.clientHeight;
      if (!avail) return;
      const want = wantedCols(standings.length, avail);
      if (want !== cols) {
        setCols(want); // re-runs this effect against the new column layout
        return;
      }
      let lo = MIN_FONT;
      let hi = MAX_FONT;
      let best = MIN_FONT;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        grid.style.fontSize = `${mid}px`;
        if (grid.offsetHeight <= avail) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      grid.style.fontSize = `${best}px`;
    };

    measure();
    // ResizeObserver catches layout changes (court cards appearing/disappearing);
    // the resize listener covers the window itself.
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [autoFit, roster, cols, standings.length]);

  // Without auto-fit (phone views) the type size comes from the breakpoint instead.
  const staticSize = standings.length > 10 ? "text-sm sm:text-base" : "text-base sm:text-xl";
  const perCol = Math.ceil(standings.length / cols) || 1;
  const chunks = Array.from({ length: cols }, (_, c) => standings.slice(c * perCol, (c + 1) * perCol)).filter((c) => c.length);

  return (
    <div className="rounded-2xl border border-court-line bg-court-panel p-4 sm:p-6 flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 mb-3 shrink-0">
        <h2 className="font-display uppercase text-xl sm:text-2xl text-gold">{title}</h2>
        <p className="text-white/50 text-[10px] sm:text-xs uppercase tracking-wide text-right">
          {note ?? (findDecider(matches) ? "Top two settled by the deciding final" : "Ties broken by points scored")}
        </p>
      </div>
      <div ref={boxRef} className="flex-1 min-h-0">
        <div ref={gridRef} className={`flex items-start gap-[1.4em] ${autoFit ? "" : staticSize}`}>
          {chunks.map((chunk, c) => (
            <div key={c} className="flex-1 min-w-0">
              <Table rows={chunk} offset={c * perCol} final={final} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
