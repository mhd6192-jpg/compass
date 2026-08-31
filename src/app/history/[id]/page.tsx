"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ClubLogo from "@/components/shared/ClubLogo";

interface Row {
  id: string;
  name: string;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
}
interface Result {
  round: number;
  roundName: string;
  side1: string;
  side2: string;
  winner: 1 | 2;
  score: string;
  endedEarly: string | null;
}
interface Award {
  place: number;
  name: string;
  detail?: string;
}
interface ArchivedEvent {
  label: string;
  formatName: string;
  scoring: string;
  tallyUnit: string;
  entrants: number;
  matches: number;
  endedAt: string;
  standings: Row[];
  players: Row[] | null;
  podium: Award[];
  results: Result[];
}

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function Table({ title, rows, unit }: { title: string; rows: Row[]; unit: string }) {
  return (
    <section className="mb-6">
      <h2 className="font-display uppercase text-sm text-white/50 mb-2">{title}</h2>
      <div className="grid gap-1">
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border border-court-line bg-court-panel px-3 py-2">
            <span className="w-6 text-center shrink-0">
              {MEDAL[i + 1] ?? <span className="text-white/30 text-xs font-mono">{i + 1}</span>}
            </span>
            <span className="flex-1 min-w-0 truncate font-display uppercase text-sm">{r.name}</span>
            <span className="shrink-0 flex items-center gap-3 font-display tabular-nums text-sm">
              <span className="text-white/80">
                {r.pointsFor}
                <span className="text-white/30 text-[10px] uppercase ml-1">{unit}</span>
              </span>
              <span className="text-white/50 text-xs">
                {r.won}W {r.lost}L
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ArchivedEventPage() {
  const params = useParams<{ id: string }>();
  const [event, setEvent] = useState<ArchivedEvent | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`/api/history/${params.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEvent(d.event))
      .catch(() => setMissing(true));
  }, [params.id]);

  if (missing) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-white/50">That event is not in the history.</p>
        <Link href="/history" className="text-gold underline underline-offset-4 font-display uppercase">
          Back to past events
        </Link>
      </main>
    );
  }
  if (!event) return <main className="min-h-screen flex items-center justify-center text-white/40">Loading…</main>;

  const played = new Date(event.endedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <header className="mb-6 text-center flex flex-col items-center gap-3">
        <ClubLogo size={40} />
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase">{event.label}</h1>
          <p className="text-white/45 mt-1 text-sm">
            {event.formatName} · {event.scoring} · {event.entrants} entrants · {played}
          </p>
        </div>
      </header>

      {event.podium.length > 0 && (
        <section className="mb-6 rounded-2xl border border-gold/40 bg-gold/5 p-4">
          <h2 className="font-display uppercase text-sm text-gold mb-2">Podium</h2>
          {event.podium.slice(0, 3).map((a) => (
            <p key={a.place} className="flex items-baseline gap-2 py-0.5">
              <span>{MEDAL[a.place] ?? a.place}</span>
              <span className="font-display uppercase">{a.name}</span>
              {a.detail && <span className="text-white/40 text-xs">{a.detail}</span>}
            </p>
          ))}
        </section>
      )}

      <Table title={event.players ? "Teams" : "Final standings"} rows={event.standings} unit={event.tallyUnit} />
      {event.players && <Table title="Players" rows={event.players} unit={event.tallyUnit} />}

      <section className="mb-8">
        <h2 className="font-display uppercase text-sm text-white/50 mb-2">Every match ({event.results.length})</h2>
        <div className="grid gap-1">
          {event.results.map((r, i) => (
            <div key={i} className="rounded-lg border border-court-line bg-court-panel px-3 py-2">
              <p className="text-white/30 text-[10px] uppercase tracking-widest mb-0.5">{r.roundName}</p>
              <p className="text-sm flex items-baseline gap-2 flex-wrap">
                <span className={r.winner === 1 ? "text-gold font-bold" : "text-white/60"}>{r.side1}</span>
                <span className="text-white/25 text-xs">vs</span>
                <span className={r.winner === 2 ? "text-gold font-bold" : "text-white/60"}>{r.side2}</span>
                <span className="text-white/70 font-display tabular-nums ml-auto">{r.score}</span>
              </p>
              {r.endedEarly && <p className="text-white/35 text-[11px] mt-0.5">{r.endedEarly}</p>}
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-center gap-4 mb-8">
        <Link href="/history" className="text-white/35 text-sm underline underline-offset-4">
          All past events
        </Link>
      </div>
    </main>
  );
}
