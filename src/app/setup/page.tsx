"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import ClubLogo from "@/components/shared/ClubLogo";
import { arrangeDraw } from "@/lib/bracket/seedArrange";

import { isPointsRace, type TiebreakMode, type TournamentFormat } from "@/lib/types";
import { MIN_TWO_GROUP_TEAMS, splitGroups, twoGroupMatchCount } from "@/lib/bracket/twoGroup";

const TIEBREAK_OPTIONS: { value: TiebreakMode; title: string; desc: string }[] = [
  {
    value: "standard",
    title: "Standard tiebreak",
    desc: "Every set (including the decider) goes to 6 games, win by 2, with a 7-point tiebreak at 6-6.",
  },
  {
    value: "match-tiebreak",
    title: "Fast deciding set",
    desc: "Sets 1 & 2 use the standard tiebreak. The deciding set is replaced by a single 10-point match tiebreak to keep things moving.",
  },
  {
    value: "advantage",
    title: "Advantage sets",
    desc: "No tiebreaks at all — sets play out to a 2-game lead, however long that takes.",
  },
  {
    value: "race-to-9",
    title: "16 points total",
    desc: "No games or sets — every point is played out until 16 total points are in, then whoever has more wins (e.g. 9-7). If it's 8-8, one sudden-death point decides it (9-8).",
  },
  {
    value: "race-to-16",
    title: "Race to 16",
    desc: "No games or sets — first side to 16 points wins, no need to lead by two. At 15-15 it's sudden death: the next point takes it 16-15.",
  },
];

// The Alhayat draw: pros seeded 1-4, beginners 13-16, the rest unseeded.
const ALHAYAT_DRAW: { name: string; seed: number | "" }[] = [
  { name: "Player One", seed: "" },
  { name: "Player Two", seed: "" },
  { name: "Player Three", seed: 16 },
  { name: "Player Four", seed: 13 },
  { name: "Player Five", seed: "" },
  { name: "Player Six", seed: 1 },
  { name: "Player Seven", seed: "" },
  { name: "Player Eight", seed: "" },
  { name: "Player Nine", seed: 2 },
  { name: "Player Ten", seed: "" },
  { name: "Player Eleven", seed: 4 },
  { name: "Player Twelve", seed: "" },
  { name: "Player Thirteen", seed: 3 },
  { name: "Player Fourteen", seed: 14 },
  { name: "Player Fifteen", seed: 15 },
  { name: "Player Sixteen", seed: "" },
];

// Matches the round-robin group sheet: 7 doubles pairs, everyone plays everyone once.
const GROUP_DRAW = ["Alpha/Bravo", "Charlie/Delta", "Echo/Foxtrot", "Golf/Hotel", "India/Juliet", "Kilo/Lima", "Mike/November"];

export default function SetupPage() {
  const [status, setStatus] = useState<"loading" | "setup" | "active" | "completed">("loading");
  const [discipline, setDiscipline] = useState<"singles" | "doubles">("doubles");
  // Wording only: an entrant is one row in the draw either way.
  const entrantLabel = discipline === "singles" ? "Player" : "Team";
  const entrantsLabel = discipline === "singles" ? "Players" : "Teams";
  const [format, setFormat] = useState<TournamentFormat>("compass");
  const [names, setNames] = useState<string[]>(Array(16).fill(""));
  const [rrNames, setRrNames] = useState<string[]>(Array(7).fill(""));
  const [seeds, setSeeds] = useState<(number | "")[]>(Array(16).fill(""));
  const [arrange, setArrange] = useState(true);
  const [bestOfSets, setBestOfSets] = useState(1);
  const [tiebreakMode, setTiebreakMode] = useState<TiebreakMode>("standard");
  const [pin, setPin] = useState("");
  const [courtIds, setCourtIds] = useState<number[]>([2, 3]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/state")
      .then((r) => r.json())
      .then((snap) => setStatus(snap.tournament?.status ?? "setup"))
      .catch(() => setStatus("setup"));
  }, []);

  function updateName(i: number, value: string) {
    setNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  }
  function updateRrName(i: number, value: string) {
    setRrNames((prev) => prev.map((n, idx) => (idx === i ? value : n)));
  }
  function loadGroupDraw() {
    setRrNames(GROUP_DRAW);
    if (!pin) setPin("1234");
  }
  function updateSeed(i: number, value: string) {
    const num = value === "" ? "" : Math.max(1, Math.min(16, parseInt(value, 10) || 0));
    setSeeds((prev) => prev.map((s, idx) => (idx === i ? (num as number | "") : s)));
  }

  function fillDemo() {
    setNames(Array.from({ length: 16 }, (_, i) => `Player ${i + 1}`));
    setSeeds(Array(16).fill(""));
    setArrange(false);
    if (!pin) setPin("1234");
  }

  function loadAlhayat() {
    setNames(ALHAYAT_DRAW.map((p) => p.name));
    setSeeds(ALHAYAT_DRAW.map((p) => p.seed));
    setArrange(true);
    if (!pin) setPin("1234");
  }

  // Live preview of the East Round of 16 pairings for the chosen order.
  const previewPairs = useMemo(() => {
    const trimmed = names.map((n) => n.trim());
    if (trimmed.some((n) => !n)) return null;
    let ordered = trimmed;
    if (arrange) {
      try {
        ordered = arrangeDraw(trimmed.map((n, i) => ({ name: n, seed: seeds[i] === "" ? null : (seeds[i] as number) })));
      } catch {
        return null;
      }
    }
    const pairs: [string, string][] = [];
    for (let i = 0; i < 8; i++) pairs.push([ordered[i * 2], ordered[i * 2 + 1]]);
    return pairs;
  }, [names, seeds, arrange]);

  // Who lands in which group, using the same alternating split the seeder uses.
  const groupPreview = useMemo(() => {
    const teams = rrNames.map((n) => n.trim()).filter(Boolean);
    if (teams.length < MIN_TWO_GROUP_TEAMS) return null;
    const [a, b] = splitGroups(teams.length);
    return [a.map((i) => teams[i]), b.map((i) => teams[i])] as [string[], string[]];
  }, [rrNames]);

  async function submit() {
    setError(null);
    const trimmed = (format === "compass" ? names : rrNames).map((n) => n.trim());
    if (format === "two-group" && trimmed.filter(Boolean).length < MIN_TWO_GROUP_TEAMS) {
      setError(`Enter at least ${MIN_TWO_GROUP_TEAMS} teams for two groups.`);
      return;
    }
    if (format === "compass" && trimmed.some((n) => !n)) {
      setError("All 16 player names must be filled in.");
      return;
    }
    if (format === "round-robin" && trimmed.filter(Boolean).length < 3) {
      setError("Enter at least 3 teams.");
      return;
    }
    if (pin.trim().length < 4) {
      setError("PIN must be at least 4 characters.");
      return;
    }
    if (courtIds.length === 0) {
      setError("Pick at least one court.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtIds,
          format,
          discipline,
          names: format === "compass" ? trimmed : trimmed.filter(Boolean),
          seeds: seeds.map((s) => (s === "" ? 0 : s)),
          arrange,
          bestOfSets,
          tiebreakMode,
          pin: pin.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start tournament");
      setSuccess(true);
      setStatus("active");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start tournament");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-white/50">Loading…</div>;
  }

  if (status !== "setup" && !success) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center rounded-2xl border border-court-line bg-court-panel p-8">
          <p className="text-4xl mb-3">🏆</p>
          <h1 className="font-display text-2xl uppercase mb-2">Tournament already {status}</h1>
          <p className="text-white/50 mb-6">The compass draw has already been seeded and is underway. Head to the scorer or TV display.</p>
          <div className="flex flex-col gap-3 mb-6">
            <Link href="/display" className="rounded-xl bg-gold text-court-bg font-display uppercase py-3 font-bold">
              Open TV Display
            </Link>
            <Link href="/scorer" className="rounded-xl border border-court-line py-3 font-display uppercase">
              Open Scorer
            </Link>
            <Link href="/control" className="rounded-xl border border-court-line py-3 font-display uppercase">
              Open TV Control
            </Link>
          </div>
          <details className="text-left">
            <summary className="text-white/40 text-xs cursor-pointer text-center">Restart tournament (erases all results)</summary>
            <div className="mt-3 flex gap-2">
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="PIN"
                type="password"
                inputMode="numeric"
                className="flex-1 bg-court-panel2 border border-court-line rounded-lg px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={async () => {
                  setError(null);
                  const res = await fetch("/api/reset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pin: pin.trim() }),
                  });
                  if (!res.ok) {
                    const data = await res.json();
                    setError(data.error || "Failed to reset");
                    return;
                  }
                  setStatus("setup");
                  setNames(Array(16).fill(""));
                  setRrNames(Array(7).fill(""));
                }}
                className="rounded-lg bg-live text-white text-xs font-bold px-4 py-2 shrink-0"
              >
                Erase &amp; restart
              </button>
            </div>
            {error && <p className="text-live text-xs mt-2">{error}</p>}
          </details>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center rounded-2xl border border-gold/40 bg-court-panel p-8">
          <div className="flex justify-center mb-3">
            <ClubLogo size={48} />
          </div>
          <h1 className="font-display text-2xl uppercase mb-2">Draw is live!</h1>
          <p className="text-white/50 mb-1">East Round of 16 is seeded and courts are assigned.</p>
          <p className="text-white/70 mb-6">
            Coach PIN: <span className="font-mono font-bold text-gold">{pin}</span>
          </p>
          <div className="flex flex-col gap-3">
            <Link href="/display" className="rounded-xl bg-gold text-court-bg font-display uppercase py-3 font-bold">
              Open TV Display
            </Link>
            <Link href="/scorer" className="rounded-xl border border-court-line py-3 font-display uppercase">
              Open Scorer
            </Link>
            <Link href="/control" className="rounded-xl border border-court-line py-3 font-display uppercase">
              Open TV Control
            </Link>
          </div>
        </div>
      </motion.main>
    );
  }

  return (
    <main className="min-h-screen p-4 sm:p-8 max-w-3xl mx-auto">
      <header className="mb-6 text-center flex flex-col items-center gap-3">
        <ClubLogo size={44} />
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold uppercase">Tournament Setup</h1>
          <p className="text-white/50 mt-2 text-sm">
            Enter the 16 {entrantsLabel.toLowerCase()}. Add seeds (1 = strongest) so top seeds meet late.
          </p>
        </div>
      </header>

      <section className="mb-6">
        <h2 className="font-display uppercase text-lg text-white/80 mb-3">Singles or doubles</h2>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: "doubles", title: "Doubles", desc: "Entrants are pairs — enter both names, e.g. Alpha/Bravo" },
            { value: "singles", title: "Singles", desc: "Entrants are individuals — one name each" },
          ] as { value: "singles" | "doubles"; title: string; desc: string }[]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDiscipline(opt.value)}
              className={`rounded-xl border p-3 text-left ${
                discipline === opt.value ? "border-gold bg-gold/10" : "border-court-line bg-court-panel"
              }`}
            >
              <p className="font-display uppercase font-bold">{opt.title}</p>
              <p className="text-white/45 text-xs mt-1">{opt.desc}</p>
            </button>
          ))}
        </div>
        <p className="text-white/30 text-xs mt-2">
          Changes the wording across the screens. The draw itself is the same either way.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="font-display uppercase text-lg text-white/80 mb-3">Draw type</h2>
        <div className="grid gap-2">
          {([
            { value: "compass", title: "Compass (16, single elim)", desc: "Sixteen players, every loser drops into a consolation draw — nobody goes home after one match." },
            { value: "round-robin", title: "Round robin group", desc: "One group, everyone plays everyone once. The table decides it, with a deciding final if the top two end level." },
            {
              value: "two-group",
              title: "Two groups → semis → final",
              desc: `Split into Group A and Group B, each a round robin. The top two of each group cross over into the semifinals (A1 v B2, B1 v A2), and the winners meet in the final. Needs at least ${MIN_TWO_GROUP_TEAMS} teams.`,
            },
          ] as { value: TournamentFormat; title: string; desc: string }[]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setFormat(opt.value);
                if (opt.value === "two-group") {
                  setTiebreakMode("race-to-16");
                  setBestOfSets(1);
                }
              }}
              className={`text-left rounded-xl border p-3 transition-colors ${
                format === opt.value ? "border-gold bg-gold/10" : "border-court-line bg-court-panel"
              }`}
            >
              <p className="font-display uppercase text-sm mb-1">{opt.title}</p>
              <p className="text-white/50 text-xs leading-relaxed">{opt.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {format === "compass" ? (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-display uppercase text-lg text-white/80">Players</h2>
            <div className="flex items-center gap-3">
              <button onClick={loadAlhayat} type="button" className="text-xs text-gold underline underline-offset-4">
                Load Alhayat draw
              </button>
              <button onClick={fillDemo} type="button" className="text-xs text-white/40 underline underline-offset-4 hover:text-white/70">
                Demo names
              </button>
            </div>
          </div>

          <div className="grid gap-1.5">
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-court-line bg-court-panel px-2 py-1.5">
                <span className="w-6 shrink-0 text-xs text-white/30 font-mono text-center">{i + 1}</span>
                <input
                  value={names[i]}
                  onChange={(e) => updateName(i, e.target.value)}
                  placeholder={`${entrantLabel} ${i + 1}`}
                  className="flex-1 min-w-0 bg-court-panel2 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-gold/50"
                />
                <input
                  value={seeds[i] === "" ? "" : String(seeds[i])}
                  onChange={(e) => updateSeed(i, e.target.value)}
                  placeholder="seed"
                  inputMode="numeric"
                  disabled={!arrange}
                  className="w-16 shrink-0 bg-court-panel2 rounded-md px-2 py-2 text-sm text-center outline-none focus:ring-2 ring-gold/50 disabled:opacity-30"
                />
              </div>
            ))}
          </div>

          <label className="flex items-start gap-3 mt-4 rounded-xl border border-court-line bg-court-panel p-3 cursor-pointer">
            <input type="checkbox" checked={arrange} onChange={(e) => setArrange(e.target.checked)} className="mt-1" />
            <span>
              <span className="font-display uppercase text-sm">Arrange bracket by seed</span>
              <span className="block text-white/50 text-xs mt-0.5">
                Seeded players are spread into separate quarters, so the top seeds can only meet in the semifinals and final. Unseeded players
                fill the rest. Turn off to use the exact order above as the pairings (1v2, 3v4…).
              </span>
            </span>
          </label>
        </section>
      ) : (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-display uppercase text-lg text-white/80">{entrantsLabel}</h2>
            <button onClick={loadGroupDraw} type="button" className="text-xs text-gold underline underline-offset-4">
              Load example group (7 {entrantsLabel.toLowerCase()})
            </button>
          </div>

          <div className="grid gap-1.5">
            {rrNames.map((n, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-court-line bg-court-panel px-2 py-1.5">
                <span className="w-6 shrink-0 text-xs text-white/30 font-mono text-center">{i + 1}</span>
                <input
                  value={n}
                  onChange={(e) => updateRrName(i, e.target.value)}
                  placeholder={`${entrantLabel} ${i + 1}${discipline === "doubles" ? " (e.g. Alpha/Bravo)" : ""}`}
                  className="flex-1 min-w-0 bg-court-panel2 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-gold/50"
                />
                {rrNames.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setRrNames((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-white/30 hover:text-live text-lg px-1"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setRrNames((prev) => [...prev, ""])}
            className="mt-2 text-xs text-white/50 underline underline-offset-4 hover:text-white/80"
          >
            + Add {entrantLabel.toLowerCase()}
          </button>
          {format === "two-group" ? (
            <p className="text-white/40 text-xs mt-3">
              Split into two groups, alternating down this list ({rrNames.filter((n) => n.trim()).length} teams →{" "}
              {twoGroupMatchCount(Math.max(rrNames.filter((n) => n.trim()).length, MIN_TWO_GROUP_TEAMS))} matches). Each group is a round
              robin; the top two of each reach the semifinals.
            </p>
          ) : (
            <p className="text-white/40 text-xs mt-3">
              Every team plays every other team once ({rrNames.length} teams → {(rrNames.length * (rrNames.length - 1)) / 2} matches).
              Standings are ranked by matches won.
            </p>
          )}
        </section>
      )}

      {format === "two-group" && groupPreview && (
        <section className="mb-6">
          <h2 className="font-display uppercase text-sm text-white/50 mb-2">Group preview</h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {(["Group A", "Group B"] as const).map((label, gi) => (
              <div key={label} className="rounded-xl border border-court-line bg-court-panel p-3">
                <p className="font-display uppercase text-xs text-gold mb-2">{label}</p>
                {groupPreview[gi].map((n) => (
                  <p key={n} className="text-sm text-white/80 truncate py-0.5">
                    {n}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {format === "compass" && previewPairs && (
        <section className="mb-6">
          <h2 className="font-display uppercase text-sm text-white/50 mb-2">East Round of 16 preview</h2>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {previewPairs.map((p, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-court-line bg-court-panel px-3 py-2 text-sm">
                <span className="text-white/30 font-mono text-xs w-6">M{i + 1}</span>
                <span className="truncate">{p[0]}</span>
                <span className="text-white/30 text-xs">vs</span>
                <span className="truncate">{p[1]}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="font-display uppercase text-lg text-white/80 mb-3">Match format</h2>
        {!isPointsRace(tiebreakMode) && (
          <div className="flex gap-2 mb-4">
            {[1, 3, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBestOfSets(n)}
                className={`flex-1 rounded-xl py-3 font-display uppercase text-sm border ${
                  bestOfSets === n ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/60"
                }`}
              >
                Best of {n}
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-2">
          {TIEBREAK_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setTiebreakMode(opt.value);
                if (isPointsRace(opt.value)) setBestOfSets(1);
              }}
              className={`text-left rounded-xl border p-3 transition-colors ${
                tiebreakMode === opt.value ? "border-gold bg-gold/10" : "border-court-line bg-court-panel"
              }`}
            >
              <p className="font-display uppercase text-sm mb-1">{opt.title}</p>
              <p className="text-white/50 text-xs leading-relaxed">{opt.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="font-display uppercase text-lg text-white/80 mb-1">Courts in use</h2>
        <p className="text-white/40 text-xs mb-3">Tap the court numbers you actually have available tonight.</p>
        <div className="grid grid-cols-6 gap-2">
          {[1, 2, 3, 4, 5, 6].map((n) => {
            const on = courtIds.includes(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => setCourtIds((prev) => (on ? prev.filter((c) => c !== n) : [...prev, n].sort((a, b) => a - b)))}
                className={`rounded-xl py-4 font-display text-lg border ${
                  on ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/50"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
        <p className={`text-xs mt-2 ${courtIds.length ? "text-white/40" : "text-live"}`}>
          {courtIds.length
            ? `${courtIds.length} court${courtIds.length > 1 ? "s" : ""}: ${courtIds.map((c) => `Court ${c}`).join(", ")} — matches fill these automatically.`
            : "Pick at least one court."}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="font-display uppercase text-lg text-white/80 mb-3">Coach PIN</h2>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="e.g. 1234"
          inputMode="numeric"
          className="w-full bg-court-panel2 border border-court-line rounded-lg px-3 py-3 text-sm outline-none focus:ring-2 ring-gold/50"
        />
        <p className="text-white/40 text-xs mt-2">
          Coaches enter this once to unlock the scorer and TV control, and it&apos;s required to submit results. Spectators who open the URL
          from the TV just hit a lock screen.
        </p>
      </section>

      {error && <p className="text-live text-sm mb-4 text-center">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-xl bg-gold text-court-bg font-display uppercase font-bold py-4 text-lg disabled:opacity-50"
      >
        {submitting ? "Starting…" : "Start the Draw"}
      </button>
    </main>
  );
}
