"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ClubLogo from "@/components/shared/ClubLogo";

interface MemberRow {
  memberId: string;
  name: string;
  events: number;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  winRate: number;
  bestRank: number | null;
  firsts: number;
  lastPlayed: string | null;
}

type Sort = "won" | "winRate" | "events" | "name";

const SORTS: { key: Sort; label: string }[] = [
  { key: "won", label: "Wins" },
  { key: "winRate", label: "Win rate" },
  { key: "events", label: "Events" },
  { key: "name", label: "Name" },
];

/**
 * Windows the club table can be cut to. "This year" is the one most people
 * mean; all time is the default because a club with three months of history
 * would otherwise open an empty page.
 */
function sinceFor(range: "all" | "year" | "90d"): string | null {
  const now = new Date();
  if (range === "year") return new Date(now.getFullYear(), 0, 1).toISOString();
  if (range === "90d") return new Date(now.getTime() - 90 * 86_400_000).toISOString();
  return null;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function whenLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Who plays here.
 *
 * Built entirely from finished events, so it says nothing until a tournament
 * has been archived — which is the honest thing for it to do. Sorted by wins by
 * default rather than by win rate: a rate puts whoever turned up once and went
 * home at the top, and the table people want to read is the one the regulars
 * are at the top of.
 */
export default function PlayersPage() {
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [sort, setSort] = useState<Sort>("won");
  const [range, setRange] = useState<"all" | "year" | "90d">("all");
  const [minEvents, setMinEvents] = useState(1);

  useEffect(() => {
    const since = sinceFor(range);
    setRows(null);
    fetch(`/api/members${since ? `?since=${encodeURIComponent(since)}` : ""}`)
      .then((r) => r.json())
      .then((d) => setRows(d.members ?? []))
      .catch(() => setRows([]));
  }, [range]);

  const shown = useMemo(() => {
    const list = (rows ?? []).filter((r) => r.events >= minEvents);
    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "events") sorted.sort((a, b) => b.events - a.events || b.won - a.won);
    else if (sort === "winRate") sorted.sort((a, b) => b.winRate - a.winRate || b.played - a.played);
    // "won" is the order the API already returns.
    return sorted;
  }, [rows, sort, minEvents]);

  const totalEvents = rows?.length ? Math.max(...rows.map((r) => r.events)) : 0;

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-4xl mx-auto">
      <header className="mb-6 text-center flex flex-col items-center gap-3">
        <ClubLogo size={44} />
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase">Players</h1>
          <p className="text-white/50 mt-2 text-sm">
            Everyone who has finished an event here, and what they have done across all of them.
          </p>
        </div>
      </header>

      {rows === null ? (
        <p className="text-white/40 text-center py-10">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-court-line bg-court-panel p-8 text-center">
          <p className="text-4xl mb-3">🎾</p>
          <p className="font-display uppercase text-lg mb-2">Nobody on record yet</p>
          <p className="text-white/45 text-sm">
            This fills up on its own. Every time a finished tournament is reset it is saved to the history, and
            everyone who played in it appears here.
          </p>
          <Link href="/history" className="inline-block mt-4 text-gold text-sm underline underline-offset-4">
            Past events
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-display uppercase tracking-wider border transition-colors ${
                    sort === s.key
                      ? "border-gold/60 bg-gold/15 text-gold"
                      : "border-court-line text-white/45 hover:text-white/70"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {(["all", "year", "90d"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded-full px-3 py-1.5 text-xs font-display uppercase tracking-wider border transition-colors ${
                    range === r
                      ? "border-gold/60 bg-gold/15 text-gold"
                      : "border-court-line text-white/45 hover:text-white/70"
                  }`}
                >
                  {r === "all" ? "All time" : r === "year" ? "This year" : "90 days"}
                </button>
              ))}
            </div>
          </div>

          {/* A win rate off one event is noise, so it can be filtered out —
              but only on request, because hiding people by default would make
              somebody wonder why they are missing. */}
          {totalEvents > 1 && (
            <label className="flex items-center gap-2 mb-3 text-xs text-white/40">
              <input
                type="checkbox"
                checked={minEvents > 1}
                onChange={(e) => setMinEvents(e.target.checked ? 2 : 1)}
                className="accent-gold"
              />
              Only show players with more than one event
            </label>
          )}

          <div className="overflow-x-auto rounded-2xl border border-court-line bg-court-panel">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-white/35 text-[11px] uppercase tracking-wider font-display">
                  <th className="text-left py-3 pl-4 pr-2 font-normal w-10">#</th>
                  <th className="text-left py-3 pr-2 font-normal">Player</th>
                  <th className="text-right py-3 px-2 font-normal">Events</th>
                  <th className="text-right py-3 px-2 font-normal">Played</th>
                  <th className="text-right py-3 px-2 font-normal">W–L</th>
                  <th className="text-right py-3 px-2 font-normal">Win rate</th>
                  <th className="text-right py-3 pl-2 pr-4 font-normal">Last played</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.memberId} className="border-t border-court-line/60 hover:bg-white/[0.03]">
                    <td className="py-3 pl-4 pr-2 text-white/30 tabular-nums">{i + 1}</td>
                    <td className="py-3 pr-2">
                      <Link href={`/players/${r.memberId}`} className="hover:text-gold transition-colors">
                        <span className="font-medium">{r.name}</span>
                        {r.firsts > 0 && (
                          <span className="ml-2 text-xs text-gold" title={`Won ${r.firsts} event${r.firsts === 1 ? "" : "s"}`}>
                            🏆{r.firsts > 1 ? `×${r.firsts}` : ""}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-white/60">{r.events}</td>
                    <td className="py-3 px-2 text-right tabular-nums text-white/60">{r.played}</td>
                    <td className="py-3 px-2 text-right tabular-nums">
                      <span className="text-gold">{r.won}</span>
                      <span className="text-white/25">–</span>
                      <span className="text-white/50">{r.lost}</span>
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-white/60">{pct(r.winRate)}</td>
                    <td className="py-3 pl-2 pr-4 text-right text-white/35 text-xs whitespace-nowrap">
                      {whenLabel(r.lastPlayed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {shown.length === 0 && (
            <p className="text-white/40 text-center py-8 text-sm">Nobody matches that filter.</p>
          )}
        </>
      )}

      <div className="flex items-center justify-center gap-4 mt-8">
        <Link href="/" className="text-white/35 text-sm underline underline-offset-4">
          Home
        </Link>
        <span className="text-white/15">·</span>
        <Link href="/history" className="text-white/35 text-sm underline underline-offset-4">
          Past events
        </Link>
      </div>
    </main>
  );
}
