"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { findDecider, standingsTables, type StandingsRow } from "@/lib/standings";
import type { MatchDTO } from "@/lib/types";

/**
 * A two-group draw is two separate tables. Ranking every team in one list would
 * put teams against each other who never played, so each group is fitted and
 * shown on its own — which is also how the players read it.
 */
const MAX_FONT = 30;
const MIN_FONT = 9;

// The same three numbers v3 uses, for the same reason: a wall television that
// shrinks a full field to 9px and then clips whoever is left over is not
// showing the standings. See the note in V3Standings.
const LEGIBLE_FONT = 14;
const MIN_ROWS_PER_PAGE = 4;
const PAGE_HOLD_MS = 8000;

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
      data-row
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
  const tables = standingsTables(matches, format);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The longest table decides the paging: the others are shorter and simply run
  // out earlier. A team format's two tables therefore turn together.
  const longest = tables.reduce((n, t) => Math.max(n, t.rows.length), 0);
  const [perPage, setPerPage] = useState(longest);
  const [page, setPage] = useState(0);

  const roster = tables.map((t) => `${t.key}:${t.rows.map((r) => r.name).join("|")}`).join("//");
  useLayoutEffect(() => {
    const box = boxRef.current;
    const list = listRef.current;
    if (!box || !list) return;

    /**
     * What one row costs at a given size, and what else shares the box.
     *
     * Measured off a mounted row rather than off the whole list, because once
     * the table is paging the list only holds a page of it — sizing from what
     * happens to be mounted would let a paged table conclude it fits and go
     * straight back to clipping.
     */
    const metrics = (px: number) => {
      list.style.fontSize = `${px}px`;
      const rows = list.querySelectorAll("[data-row]");
      const first = rows[0] as HTMLElement | undefined;
      if (!first) return null;
      const gap = 0.35 * px; // gap-[0.35em] between rows
      const step = first.offsetHeight + gap;
      // Anything in the box that is not a row — a group label on a two-table
      // draw — still has to be paid for out of the same height.
      const overhead = Math.max(0, list.offsetHeight - (rows.length * step - gap));
      return { step, gap, overhead };
    };

    /** Largest size in [lo, hi] that satisfies `fits`, or null if none does. */
    const largest = (lo: number, hi: number, fits: (px: number) => boolean) => {
      let best: number | null = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (fits(mid)) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return best;
    };

    const measure = () => {
      const avail = box.clientHeight;
      if (!avail || longest === 0) return;

      const roomFor = (px: number) => {
        const m = metrics(px);
        if (!m) return longest;
        const usable = avail - m.overhead;
        return usable <= 0 ? 1 : Math.max(1, Math.floor((usable + m.gap) / m.step));
      };

      // The whole field at a readable size is the answer whenever it exists,
      // and it is the common case — a club night of eight lands here.
      const whole = largest(MIN_FONT, MAX_FONT, (px) => roomFor(px) >= longest);
      if (whole !== null && whole >= LEGIBLE_FONT) {
        list.style.fontSize = `${whole}px`;
        setPerPage(longest);
        return;
      }

      // It does not fit at a size worth reading. Rather than shrink into
      // illegibility and clip the remainder, turn the pages — and page at the
      // readable size exactly, not above it. Bigger text would mean fewer names
      // per page and more pages to sit through, and the person watching is
      // looking for their own name: they find it sooner on a fuller page.
      let size = LEGIBLE_FONT;
      if (roomFor(size) < MIN_ROWS_PER_PAGE) {
        // A panel too short for a worthwhile page even at the readable size
        // takes the largest size that does fit one, and failing that the
        // smallest size there is — but it still pages rather than clips.
        size = largest(MIN_FONT, LEGIBLE_FONT, (px) => roomFor(px) >= MIN_ROWS_PER_PAGE) ?? MIN_FONT;
      }
      const fits = roomFor(size);
      list.style.fontSize = `${size}px`;
      setPerPage(Math.max(1, Math.min(longest, fits)));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [roster, longest]);

  const pages = perPage > 0 ? Math.ceil(longest / perPage) : 1;

  // Turning pages is what stops the screen leaving people out, so it runs on
  // its own and not off the poll: a table that has not changed still has to
  // finish showing everybody.
  useEffect(() => {
    if (pages <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), PAGE_HOLD_MS);
    return () => clearInterval(t);
  }, [pages]);

  // A field that shrinks — somebody leaves — must not strand the view on a page
  // that no longer exists.
  useEffect(() => {
    if (page >= pages) setPage(0);
  }, [page, pages]);

  const from = pages > 1 ? page * perPage : 0;
  const shown = pages > 1 ? perPage : longest;

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
          {pages > 1 ? (
            <>
              <span className="text-gold">
                {from + 1}–{Math.min(from + shown, longest)} of {longest}
              </span>
              <span className="mx-[0.6em] text-white/20">·</span>
            </>
          ) : null}
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
              {table.rows.slice(from, from + shown).map((row, i) => (
                <Row key={row.id} row={row} rank={from + i + 1} ranked={table.rows.some((r) => r.won + r.lost > 0)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
