"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ClubLogo from "@/components/shared/ClubLogo";

interface EventRow {
  id: string;
  label: string;
  formatName: string;
  scoring: string;
  entrants: number;
  matches: number;
  endedAt: string;
}

/**
 * Past events.
 *
 * Deliberately plain: this is the screen someone opens weeks later to settle an
 * argument about who won, not something a TV shows.
 */
export default function HistoryPage() {
  const [events, setEvents] = useState<EventRow[] | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .catch(() => setEvents([]));
  }, []);

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <header className="mb-6 text-center flex flex-col items-center gap-3">
        <ClubLogo size={44} />
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase">Past events</h1>
          <p className="text-white/50 mt-2 text-sm">
            Every finished tournament is kept here automatically when the draw is reset.
          </p>
        </div>
      </header>

      {events === null ? (
        <p className="text-white/40 text-center py-10">Loading…</p>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-court-line bg-court-panel p-8 text-center">
          <p className="text-4xl mb-3">📁</p>
          <p className="font-display uppercase text-lg mb-2">Nothing here yet</p>
          <p className="text-white/45 text-sm">
            When you reset a tournament that has results, it is saved here first — so starting the next event no
            longer loses the last one.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {events.map((e) => (
            <Link
              key={e.id}
              href={`/history/${e.id}`}
              className="rounded-xl border border-court-line bg-court-panel p-4 flex items-center gap-4 hover:border-gold/60 transition-colors"
            >
              <span className="flex-1 min-w-0">
                <span className="block font-display uppercase text-base truncate">{e.label}</span>
                <span className="block text-white/40 text-xs mt-0.5">
                  {e.formatName} · {e.entrants} entrants · {e.matches} matches · {e.scoring}
                </span>
              </span>
              <span className="text-white/25 text-xl shrink-0">›</span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-4 mt-8">
        <Link href="/" className="text-white/35 text-sm underline underline-offset-4">
          Home
        </Link>
        <span className="text-white/15">·</span>
        <Link href="/setup" className="text-white/35 text-sm underline underline-offset-4">
          Set up an event
        </Link>
      </div>
    </main>
  );
}
