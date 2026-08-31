"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ClubLogo from "@/components/shared/ClubLogo";

interface ResultRow {
  eventId: string;
  label: string;
  formatName: string;
  entrants: number;
  tallyUnit: string;
  playedAs: string;
  rank: number;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  endedAt: string;
}

interface Detail {
  member: { id: string; name: string };
  results: ResultRow[];
}

interface Candidate {
  memberId: string;
  name: string;
  events: number;
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** 1st, 2nd, 3rd — a finishing position reads badly as a bare number. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-court-line bg-court-panel px-4 py-3 text-center">
      <div className="font-display text-2xl text-gold tabular-nums">{value}</div>
      <div className="text-white/35 text-[11px] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

/**
 * One person's record.
 *
 * Also where the two repairs live, because this is the page somebody is on when
 * they notice a problem: a name spelled wrong, or the same person appearing
 * twice because it was spelled two ways. Both need the organiser PIN — they
 * rewrite the club's records rather than tonight's scores.
 */
export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [others, setOthers] = useState<Candidate[]>([]);

  const [pin, setPin] = useState("");
  const [rename, setRename] = useState("");
  const [mergeId, setMergeId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/members/${params.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Detail) => {
        setDetail(d);
        setRename(d.member.name);
      })
      .catch(() => setMissing(true));
  }, [params.id]);

  useEffect(() => {
    load();
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => setOthers((d.members ?? []).filter((m: Candidate) => m.memberId !== params.id)))
      .catch(() => setOthers([]));
  }, [load, params.id]);

  async function doRename() {
    if (!detail || busy) return;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(`/api/members/${detail.member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, name: rename }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNote(body.error ?? "Could not rename.");
      else {
        setNote(`Renamed to ${body.member.name}.`);
        load();
      }
    } catch {
      setNote("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function doMerge() {
    if (!detail || !mergeId || busy) return;
    const other = others.find((o) => o.memberId === mergeId);
    if (!confirm(`Fold ${other?.name} into ${detail.member.name}? ${other?.name} is deleted and cannot be brought back.`)) {
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/members/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, keepId: detail.member.id, dropId: mergeId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNote(body.error ?? "Could not merge.");
      else {
        setNote(`Merged — ${body.moved} event${body.moved === 1 ? "" : "s"} moved across.`);
        setMergeId("");
        setOthers((list) => list.filter((o) => o.memberId !== mergeId));
        load();
      }
    } catch {
      setNote("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="font-display uppercase text-2xl">No such player</h1>
        <Link href="/players" className="text-gold underline underline-offset-4">
          Back to players
        </Link>
      </main>
    );
  }

  if (!detail) return <main className="min-h-screen p-8 text-center text-white/40">Loading…</main>;

  const { member, results } = detail;
  const played = results.reduce((n, r) => n + r.played, 0);
  const won = results.reduce((n, r) => n + r.won, 0);
  const firsts = results.filter((r) => r.rank === 1).length;
  const best = results.length ? Math.min(...results.map((r) => r.rank)) : null;
  // Names entered differently on different nights, which is usually the first
  // sign that this person exists twice.
  const aliases = [...new Set(results.map((r) => r.playedAs))].filter((n) => n !== member.name);

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <header className="mb-6 text-center flex flex-col items-center gap-3">
        <ClubLogo size={40} />
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase">{member.name}</h1>
          {aliases.length > 0 && (
            <p className="text-white/35 mt-1 text-xs">also entered as {aliases.join(", ")}</p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        <Stat label="Events" value={String(results.length)} />
        <Stat label="Matches" value={String(played)} />
        <Stat label="Win rate" value={played ? `${Math.round((won / played) * 100)}%` : "—"} />
        <Stat label={firsts > 0 ? "Won" : "Best finish"} value={firsts > 0 ? `${firsts}×` : best ? ordinal(best) : "—"} />
      </div>

      {results.length === 0 ? (
        <p className="text-white/40 text-center py-8 text-sm">No finished events yet.</p>
      ) : (
        <div className="grid gap-2">
          {results.map((r) => (
            <Link
              key={r.eventId}
              href={`/history/${r.eventId}`}
              className="rounded-xl border border-court-line bg-court-panel p-4 flex items-center gap-4 hover:border-gold/60 transition-colors"
            >
              <span className={`font-display text-xl tabular-nums w-12 shrink-0 ${r.rank === 1 ? "text-gold" : "text-white/40"}`}>
                {ordinal(r.rank)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-display uppercase text-sm truncate">{r.label}</span>
                <span className="block text-white/40 text-xs mt-0.5">
                  {whenLabel(r.endedAt)} · {r.formatName} · of {r.entrants} · won {r.won} of {r.played} ·{" "}
                  {r.pointsFor} {r.tallyUnit}
                </span>
              </span>
              <span className="text-white/25 text-xl shrink-0">›</span>
            </Link>
          ))}
        </div>
      )}

      <details className="mt-8 rounded-2xl border border-court-line bg-court-panel/60 p-4">
        <summary className="text-white/40 text-xs cursor-pointer font-display uppercase tracking-wider">
          Organiser tools
        </summary>
        <p className="text-white/35 text-xs mt-3">
          Players are matched to their record by name as a draw is seeded, so one typo makes two people out of one.
          These two fix that. Both need the organiser PIN.
        </p>

        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Organiser PIN"
          className="mt-3 w-full rounded-xl border border-court-line bg-court-bg px-3 py-2 text-sm"
        />

        <div className="mt-4 grid gap-2">
          <label className="text-white/40 text-xs">Correct the name</label>
          <div className="flex gap-2">
            <input
              value={rename}
              onChange={(e) => setRename(e.target.value)}
              className="flex-1 rounded-xl border border-court-line bg-court-bg px-3 py-2 text-sm"
            />
            <button
              onClick={doRename}
              disabled={busy || !pin || !rename.trim() || rename.trim() === member.name}
              className="rounded-xl border border-court-line px-4 py-2 text-xs font-display uppercase disabled:opacity-35"
            >
              Rename
            </button>
          </div>
        </div>

        {others.length > 0 && (
          <div className="mt-4 grid gap-2">
            <label className="text-white/40 text-xs">
              Same person, entered under another name — fold their record into this one
            </label>
            <div className="flex gap-2">
              <select
                value={mergeId}
                onChange={(e) => setMergeId(e.target.value)}
                className="flex-1 rounded-xl border border-court-line bg-court-bg px-3 py-2 text-sm"
              >
                <option value="">Pick a player…</option>
                {others.map((o) => (
                  <option key={o.memberId} value={o.memberId}>
                    {o.name} ({o.events} event{o.events === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
              <button
                onClick={doMerge}
                disabled={busy || !pin || !mergeId}
                className="rounded-xl border border-live/40 text-live px-4 py-2 text-xs font-display uppercase disabled:opacity-35"
              >
                Merge
              </button>
            </div>
            <p className="text-white/25 text-[11px]">
              The player you pick is deleted and their events move here. This cannot be undone.
            </p>
          </div>
        )}

        {note && <p className="mt-3 text-xs text-gold">{note}</p>}
      </details>

      <div className="flex items-center justify-center gap-4 mt-8">
        <button onClick={() => router.back()} className="text-white/35 text-sm underline underline-offset-4">
          Back
        </button>
        <span className="text-white/15">·</span>
        <Link href="/players" className="text-white/35 text-sm underline underline-offset-4">
          All players
        </Link>
      </div>
    </main>
  );
}
