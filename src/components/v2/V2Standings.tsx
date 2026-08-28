"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { computeStandings, findDecider, type StandingsRow } from "@/lib/standings";
import type { MatchDTO } from "@/lib/types";

/**
 * A two-group draw is two separate tables. Ranking every team in one list would
 * put teams against each other who never played, so each group is fitted and
 * shown on its own — which is also how the players read it.
 */
function splitTables(matches: MatchDTO[], format?: string): Array<{ key: string; label: string | null; rows: StandingsRow[] }> {
  if (format === "two-group") {
    return [
      { key: "GA", label: "Group A", rows: computeStandings(matches.filter((m) => m.bracket === "GA")) },
      { key: "GB", label: "Group B", rows: computeStandings(matches.filter((m) => m.bracket === "GB")) },
    ].filter((t) => t.rows.length > 0);
  }
  return [{ key: "all", label: null, rows: computeStandings(matches) }];
}

const MAX_FONT = 30;
const MIN_FONT = 9;

/** Medal treatment for the places people photograph. */
const PODIUM: Record<number, { medal: string; row: string; rank: string; name: string }> = {
  1: {
    medal: "🥇",
    row: "border-gold/60 bg-gradient-to-r from-gold/25 via-gold/10 to-transparent",
    rank: "text-gold",
    name: "text-gold",
  },
  2: {
    medal: "🥈",
    row: "border-white/35 bg-gradient-to-r from-white/15 via-white/[0.06] to-transparent",
    rank: "text-white/90",
    name: "text-white",
  },
  3: {
    medal: "🥉",
    row: "border-[#c8843c]/50 bg-gradient-to-r from-[#c8843c]/20 via-[#c8843c]/[0.07] to-transparent",
    rank: "text-[#e0a668]",
    name: "text-white",
  },
};

function Row({ row, rank, ranked }: { row: StandingsRow; rank: number; ranked: boolean }) {
  // Medals only once results exist. On an untouched table every team is level,
  // so a gold row would just be crowning whoever sorted first.
  const podium = ranked ? PODIUM[rank] : undefined;

  return (
    <motion.div
      layout
      className={`flex items-center gap-[0.7em] rounded-[0.55em] border px-[0.7em] py-[0.42em] ${
        podium ? podium.row : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <span className="w-[1.6em] shrink-0 text-center" style={{ fontSize: "1.15em", lineHeight: 1 }}>
        {podium ? podium.medal : <span className="text-white/35 font-display">{rank}</span>}
      </span>

      <span
        className={`flex-1 min-w-0 truncate font-display uppercase font-bold tracking-tight ${
          podium ? podium.name : "text-white/85"
        }`}
        style={{ fontSize: "1.15em" }}
      >
        {row.name}
      </span>

      <span className="shrink-0 flex items-center gap-[0.55em] font-display tabular-nums">
        <span className={`text-center ${podium ? podium.rank : "text-white/80"}`} style={{ minWidth: "1.6em" }}>
          {row.won}
          <span className="text-white/30 text-[0.55em] uppercase tracking-widest ml-[0.25em]">W</span>
        </span>
        <span className="text-center text-white/55" style={{ minWidth: "1.6em" }}>
          {row.lost}
          <span className="text-white/25 text-[0.55em] uppercase tracking-widest ml-[0.25em]">L</span>
        </span>
        <span className="text-center text-white/70" style={{ minWidth: "2.6em" }}>
          {row.pointsFor}
          <span className="text-white/25 text-[0.55em] uppercase tracking-widest ml-[0.25em]">pts</span>
        </span>
      </span>
    </motion.div>
  );
}

/**
 * The standings as they should look in a photo.
 *
 * v1's table is built to pack a big draw into a small panel; this one is built
 * for the shot players take of the screen at the end — medals on the top three,
 * their rows lit in gold, silver and bronze, and names big enough to read back
 * off a phone. Everything scales off one font size that is fitted to whatever
 * height the panel has, so it fills the screen without ever scrolling.
 */
export default function V2Standings({
  matches,
  title = "Standings",
  subtitle,
  format,
}: {
  matches: MatchDTO[];
  title?: string;
  subtitle?: string;
  format?: string;
}) {
  const tables = splitTables(matches, format);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const roster = tables.map((t) => `${t.key}:${t.rows.map((r) => r.name).join("|")}`).join("//");
  useLayoutEffect(() => {
    const box = boxRef.current;
    const list = listRef.current;
    if (!box || !list) return;

    const measure = () => {
      const avail = box.clientHeight;
      if (!avail) return;
      let lo = MIN_FONT;
      let hi = MAX_FONT;
      let best = MIN_FONT;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        list.style.fontSize = `${mid}px`;
        if (list.offsetHeight <= avail) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      list.style.fontSize = `${best}px`;
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [roster]);

  return (
    <div className="rounded-2xl border border-court-line bg-court-panel px-[2vw] py-[2vh] flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 mb-[1.4vh] shrink-0">
        <h2 className="font-display uppercase text-gold" style={{ fontSize: "clamp(1rem, 2.2vw, 2.4rem)" }}>
          {title}
        </h2>
        <p
          className="text-white/40 uppercase tracking-wide text-right"
          style={{ fontSize: "clamp(0.55rem, 1vw, 1rem)" }}
        >
          {subtitle ??
            (format === "two-group"
              ? "Top two of each group reach the semifinals"
              : findDecider(matches)
                ? "Top two settled by the deciding final"
                : "Ties broken by points scored")}
        </p>
      </div>

      <div ref={boxRef} className="flex-1 min-h-0">
        <div ref={listRef} className={`flex gap-[1.2em] ${tables.length > 1 ? "flex-row" : "flex-col"}`}>
          {tables.map((table) => (
            <div key={table.key} className="flex-1 min-w-0 flex flex-col gap-[0.35em]">
              {table.label && (
                <p className="font-display uppercase tracking-[0.25em] text-white/45 mb-[0.15em]" style={{ fontSize: "0.7em" }}>
                  {table.label}
                </p>
              )}
              {table.rows.map((row, i) => (
                <Row key={row.id} row={row} rank={i + 1} ranked={table.rows.some((r) => r.won + r.lost > 0)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
