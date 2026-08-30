"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import ClubLogo from "@/components/shared/ClubLogo";
import { arrangeDraw } from "@/lib/bracket/seedArrange";

import { isPointsRace, type TiebreakMode, type TournamentFormat } from "@/lib/types";
import { MIN_TWO_GROUP_TEAMS, splitGroups, twoGroupMatchCount } from "@/lib/bracket/twoGroup";
import {
  defaultRounds,
  generateAmericano,
  matchesPerRound,
  scheduleQuality,
  MAX_AMERICANO_PLAYERS,
  MAX_AMERICANO_ROUNDS,
  MIN_AMERICANO_PLAYERS,
} from "@/lib/bracket/americano";
import { pairByRank, MIN_MEXICANO_PLAYERS } from "@/lib/bracket/mexicano";
import { courtCount, courtLevelName, isValidKingCourtField, openingLadder, MIN_KING_COURT_PLAYERS } from "@/lib/bracket/kingCourt";
import {
  defaultTeamRounds,
  generateTeamAmericano,
  isValidTeamField,
  maxTeamRounds,
  teamName,
  teamScheduleQuality,
  teamSize,
  matchesPerRound as teamMatchesPerRound,
  MIN_TEAM_AMERICANO_PLAYERS,
} from "@/lib/bracket/teamAmericano";
import {
  defaultMixicanoRounds,
  generateMixicano,
  groupSize,
  isValidMixicanoField,
  maxMixicanoRounds,
  mixicanoGroupName,
  mixicanoScheduleQuality,
  matchesPerRound as mixicanoMatchesPerRound,
  MIN_MIXICANO_PLAYERS,
} from "@/lib/bracket/mixicano";
import {
  defaultWinnerCourtRounds,
  isValidWinnerCourtField,
  openingRound,
  waitingCount,
  MIN_WINNER_COURT_PLAYERS,
} from "@/lib/bracket/winnerCourt";
import {
  defaultMixedMexicanoRounds,
  isValidMixedMexicanoField,
  openingRound as mixedOpeningRound,
  groupSize as mixedGroupSize,
  matchesPerRound as mixedMexMatchesPerRound,
  MIN_MIXED_MEXICANO_PLAYERS,
} from "@/lib/bracket/mixedMexicano";
import {
  defaultMixedTeamRounds,
  generateMixedTeamAmericano,
  halfSize as mixedTeamHalfSize,
  isValidMixedTeamField,
  maxMixedTeamRounds,
  mixedTeamScheduleQuality,
  teamSize as mixedTeamSize,
  matchesPerRound as mixedTeamMatchesPerRound,
  MIN_MIXED_TEAM_PLAYERS,
} from "@/lib/bracket/mixedTeamAmericano";

/** The set-based options never change; the race options describe themselves with the chosen target. */
function tiebreakOptions(target: number): { value: TiebreakMode; title: string; desc: string }[] {
  const total = 2 * target - 2;
  return [
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
      title: `${total} points total`,
      desc: `No games or sets — every point is played out until ${total} total points are in, then whoever has more wins (e.g. ${target}-${target - 2}). If it's ${target - 1}-${target - 1}, one sudden-death point decides it (${target}-${target - 1}).`,
    },
    {
      value: "race-to-16",
      title: `Race to ${target}`,
      desc: `No games or sets — first side to ${target} points wins, no need to lead by two. At ${target - 1}-${target - 1} it's sudden death: the next point takes it ${target}-${target - 1}.`,
    },
  ];
}

const RACE_TARGET_PRESETS = [9, 11, 16, 18, 21];
const SERVE_EVERY_PRESETS = [2, 3, 4, 5];

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
  const [format, setFormat] = useState<TournamentFormat>("compass");
  // Wording only: an entrant is one row in the draw either way. An americano is
  // always entered as individuals, however the club normally plays — the whole
  // point of the format is that the pairs are made up as it goes.
  const mexicano = format === "mexicano";
  const kingCourt = format === "king-court";
  const teamAmericano = format === "team-americano";
  const mixicano = format === "mixicano";
  const winnerCourt = format === "winner-court";
  const mixedMexicano = format === "mixed-mexicano";
  const mixedAmericano = format === "mixed-americano";
  const mixedTeam = format === "mixed-team-americano";
  // All the rotating-partner formats share this whole section of the form.
  const americano =
    format === "americano" ||
    mexicano ||
    kingCourt ||
    teamAmericano ||
    mixicano ||
    winnerCourt ||
    mixedMexicano ||
    mixedAmericano ||
    mixedTeam;
  // The ones needing a full multiple of four rather than merely enough players.
  const needsFours = kingCourt || teamAmericano || mixicano || mixedTeam;
  const entrantLabel = americano || discipline === "singles" ? "Player" : "Team";
  const entrantsLabel = americano || discipline === "singles" ? "Players" : "Teams";
  const [names, setNames] = useState<string[]>(Array(16).fill(""));
  const [rrNames, setRrNames] = useState<string[]>(Array(7).fill(""));
  const [seeds, setSeeds] = useState<(number | "")[]>(Array(16).fill(""));
  const [arrange, setArrange] = useState(true);
  const [bestOfSets, setBestOfSets] = useState(1);
  const [tiebreakMode, setTiebreakMode] = useState<TiebreakMode>("standard");
  const [amRounds, setAmRounds] = useState(0); // 0 = use the default for the field size
  const [raceTarget, setRaceTarget] = useState(16);
  const [serveEvery, setServeEvery] = useState(4);
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
  function loadAmericanoDemo() {
    setRrNames(Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`));
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

  // The americano rotation, previewed from the same generator the seeder uses,
  // so what the organiser reads here is exactly the draw they get.
  const amPlayerCount = rrNames.filter((n) => n.trim()).length;
  // A team americano runs out of partner combinations far sooner than a plain
  // one — a team of four has only three — so it gets its own default rather
  // than the generic eight, which would schedule rounds of repeats by default.
  const effectiveRounds =
    amRounds ||
    (teamAmericano && isValidTeamField(amPlayerCount)
      ? defaultTeamRounds(amPlayerCount)
      : mixicano && isValidMixicanoField(amPlayerCount)
      ? defaultMixicanoRounds(amPlayerCount)
      : winnerCourt && isValidWinnerCourtField(amPlayerCount)
      ? defaultWinnerCourtRounds(amPlayerCount)
      : mixedMexicano && isValidMixedMexicanoField(amPlayerCount)
      ? defaultMixedMexicanoRounds(amPlayerCount)
      : mixedTeam && isValidMixedTeamField(amPlayerCount)
      ? defaultMixedTeamRounds(amPlayerCount)
      : defaultRounds(Math.max(amPlayerCount, MIN_AMERICANO_PLAYERS)));
  const amPreview = useMemo(() => {
    // The mixed americano uses this same rotation — the groups change how it is
    // ranked, never how it is drawn, so the preview is genuinely the same one.
    const usesPlainRotation = format === "americano" || format === "mixed-americano";
    if (!usesPlainRotation || amPlayerCount < MIN_AMERICANO_PLAYERS || amPlayerCount > MAX_AMERICANO_PLAYERS) return null;
    if (format === "mixed-americano" && amPlayerCount % 2 !== 0) return null;
    try {
      const schedule = generateAmericano(amPlayerCount, effectiveRounds);
      return { schedule, quality: scheduleQuality(schedule, amPlayerCount) };
    } catch {
      return null;
    }
  }, [format, amPlayerCount, effectiveRounds]);

  // A mexicano can only be previewed one round deep, and saying so is the
  // honest thing: every later round is drawn from a table that does not exist
  // until the night is under way.
  const mxPreview = useMemo(() => {
    if (!mexicano || amPlayerCount < MIN_MEXICANO_PLAYERS) return null;
    const names = rrNames.map((n) => n.trim()).filter(Boolean);
    return { pairs: pairByRank(amPlayerCount - (amPlayerCount % 4)), names, sitting: names.slice(amPlayerCount - (amPlayerCount % 4)) };
  }, [mexicano, amPlayerCount, rrNames]);

  // The opening ladder. Like the mexicano this can only be shown one round
  // deep: every later round depends on who wins on each rung tonight.
  const kcPreview = useMemo(() => {
    if (!kingCourt || !isValidKingCourtField(amPlayerCount)) return null;
    const names = rrNames.map((n) => n.trim()).filter(Boolean);
    return { rungs: openingLadder(amPlayerCount), names };
  }, [kingCourt, amPlayerCount, rrNames]);

  // The two sides and their opening rotation, from the same generator the
  // seeder uses.
  const taPreview = useMemo(() => {
    if (!teamAmericano || !isValidTeamField(amPlayerCount)) return null;
    const names = rrNames.map((n) => n.trim()).filter(Boolean);
    const size = teamSize(amPlayerCount);
    try {
      const matches = generateTeamAmericano(amPlayerCount, effectiveRounds);
      return {
        names,
        teams: [names.slice(0, size), names.slice(size)],
        matches,
        quality: teamScheduleQuality(matches, amPlayerCount),
      };
    } catch {
      return null;
    }
  }, [teamAmericano, amPlayerCount, rrNames, effectiveRounds]);

  // The two groups and the cross-group rotation, from the same generator the
  // seeder uses.
  const mixPreview = useMemo(() => {
    if (!mixicano || !isValidMixicanoField(amPlayerCount)) return null;
    const names = rrNames.map((n) => n.trim()).filter(Boolean);
    const size = groupSize(amPlayerCount);
    try {
      const matches = generateMixicano(amPlayerCount, effectiveRounds);
      return {
        names,
        groups: [names.slice(0, size), names.slice(size)],
        matches,
        quality: mixicanoScheduleQuality(matches, amPlayerCount),
      };
    } catch {
      return null;
    }
  }, [mixicano, amPlayerCount, rrNames, effectiveRounds]);

  // The opening match and the line behind it. Only the first match can be
  // shown: who plays next depends on who holds the court.
  const wcPreview = useMemo(() => {
    if (!winnerCourt || !isValidWinnerCourtField(amPlayerCount)) return null;
    const names = rrNames.map((n) => n.trim()).filter(Boolean);
    return openingRound(names);
  }, [winnerCourt, amPlayerCount, rrNames]);

  // The four quarters and the rotation they produce.
  const mtPreview = useMemo(() => {
    if (!mixedTeam || !isValidMixedTeamField(amPlayerCount)) return null;
    const names = rrNames.map((n) => n.trim()).filter(Boolean);
    const size = mixedTeamSize(amPlayerCount);
    const half = mixedTeamHalfSize(amPlayerCount);
    try {
      const matches = generateMixedTeamAmericano(amPlayerCount, effectiveRounds);
      return {
        names,
        quarters: [
          names.slice(0, half),
          names.slice(half, size),
          names.slice(size, size + half),
          names.slice(size + half),
        ],
        matches,
        quality: mixedTeamScheduleQuality(matches, amPlayerCount),
      };
    } catch {
      return null;
    }
  }, [mixedTeam, amPlayerCount, rrNames, effectiveRounds]);

  // Which half of the entry list is which group — the mixed americano's only
  // structural difference from a plain one.
  const maGroups = useMemo(() => {
    if (!mixedAmericano || amPlayerCount < MIN_AMERICANO_PLAYERS || amPlayerCount % 2 !== 0) return null;
    const names = rrNames.map((n) => n.trim()).filter(Boolean);
    const half = amPlayerCount / 2;
    return [names.slice(0, half), names.slice(half)];
  }, [mixedAmericano, amPlayerCount, rrNames]);

  // The opening round and the two groups. Only round 1 can be shown: every
  // later one is redrawn from a table that does not exist yet.
  const mmPreview = useMemo(() => {
    if (!mixedMexicano || !isValidMixedMexicanoField(amPlayerCount)) return null;
    const names = rrNames.map((n) => n.trim()).filter(Boolean);
    const size = mixedGroupSize(amPlayerCount);
    return {
      names,
      groups: [names.slice(0, size), names.slice(size)],
      round: mixedOpeningRound(amPlayerCount),
    };
  }, [mixedMexicano, amPlayerCount, rrNames]);

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
    if (mixedTeam && !isValidMixedTeamField(trimmed.filter(Boolean).length)) {
      setError(
        `A mixed team americano needs a multiple of four players, at least ${MIN_MIXED_TEAM_PLAYERS} — two teams that each split into two halves.`
      );
      return;
    }
    if (mixedAmericano) {
      const n = trimmed.filter(Boolean).length;
      if (n < MIN_AMERICANO_PLAYERS || n % 2 !== 0) {
        setError(`A mixed americano needs an even number of players, at least ${MIN_AMERICANO_PLAYERS}, so the groups come out equal.`);
        return;
      }
    }
    if (mixedMexicano && !isValidMixedMexicanoField(trimmed.filter(Boolean).length)) {
      setError(
        `A mixed mexicano needs a multiple of four players, at least ${MIN_MIXED_MEXICANO_PLAYERS} — two equal groups that make whole matches.`
      );
      return;
    }
    if (winnerCourt && !isValidWinnerCourtField(trimmed.filter(Boolean).length)) {
      setError(
        `A winner court needs at least ${MIN_WINNER_COURT_PLAYERS} players — four on court and a pair waiting to challenge.`
      );
      return;
    }
    if (mixicano && !isValidMixicanoField(trimmed.filter(Boolean).length)) {
      setError(
        `A mixicano needs a multiple of four players, at least ${MIN_MIXICANO_PLAYERS} — two equal groups that make whole matches.`
      );
      return;
    }
    if (teamAmericano && !isValidTeamField(trimmed.filter(Boolean).length)) {
      setError(
        `A team americano needs a multiple of four players, at least ${MIN_TEAM_AMERICANO_PLAYERS} — two equal teams that each split into pairs.`
      );
      return;
    }
    if (kingCourt && !isValidKingCourtField(trimmed.filter(Boolean).length)) {
      setError(
        `King of the court needs a multiple of four players, at least ${MIN_KING_COURT_PLAYERS} — every court on the ladder has to be full.`
      );
      return;
    }
    if (americano && !needsFours && trimmed.filter(Boolean).length < MIN_AMERICANO_PLAYERS) {
      setError(`Enter at least ${MIN_AMERICANO_PLAYERS} players for ${mexicano ? "a mexicano" : "an americano"}.`);
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
          raceTarget,
          serveEvery,
          amRounds: amRounds || effectiveRounds,
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
          <p className="text-white/50 mb-1">
            {americano
              ? `Round 1 is on the courts. ${effectiveRounds} rounds are scheduled${
                  mexicano ? ", each drawn from the standings as they stand" : ""
                }${kingCourt ? ", with winners climbing a court after each one" : ""}${
                  teamAmericano ? ", with every point going to your team" : ""
                }${mixicano ? ", pairing across the two groups" : ""}${
                  winnerCourt ? ", with the winners keeping the court" : ""
                }${mixedMexicano ? ", each drawn from the standings with pairs crossing the groups" : ""}${
                  mixedAmericano ? ", with the two groups ranked separately" : ""
                }${mixedTeam ? ", with every pair mixed within its team" : ""}.`
              : format === "compass"
              ? "East Round of 16 is seeded and courts are assigned."
              : "The fixtures are generated and courts are assigned."}
          </p>
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
            {mixedTeam
              ? "Enter it in quarters: each team's first half, then its second. You partner across your own team's halves."
              : mixedAmericano
              ? "Enter one group and then the other. Partners come from the whole field; each group gets its own winner."
              : mixedMexicano
              ? "Enter one group and then the other, strongest first. Pairs cross the groups; the courts follow the standings."
              : winnerCourt
              ? "Enter everyone playing, in the order they should queue. The first four start; the rest wait their turn."
              : mixicano
              ? "Enter one group and then the other. Every pair is one from each group, and your partner changes every round."
              : teamAmericano
              ? "Enter one team and then the other. Partners rotate within your team; every point goes to your side."
              : kingCourt
              ? "Enter everyone playing, strongest first — that sets the opening ladder. Win and you climb a court."
              : mexicano
              ? "Enter everyone playing, strongest first. Partners are drawn from the standings and change every round."
              : americano
              ? "Enter everyone playing. Partners are drawn for you and change every round."
              : format === "compass"
              ? `Enter the 16 ${entrantsLabel.toLowerCase()}. Add seeds (1 = strongest) so top seeds meet late.`
              : `Enter the ${entrantsLabel.toLowerCase()} taking part.`}
          </p>
        </div>
      </header>

      <section className={`mb-6 ${americano ? "hidden" : ""}`}>
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
            {
              value: "americano",
              title: "Americano (rotating partners)",
              desc: `Enter individuals, not pairs. Every round everyone gets a new partner and a new pair of opponents, and each player keeps their own running points total — the winner is the highest scorer, not a team. Needs at least ${MIN_AMERICANO_PLAYERS} players.`,
            },
            {
              value: "mixed-mexicano",
              title: "Mixed mexicano (standings + two groups)",
              desc: `Both at once: every pair is one player from each group, and each round is redrawn from the standings. Each group is ranked on its own, so the top two of each meet on the first court, the next two of each on the second, and winning moves you up into tougher company. Needs a multiple of four players.`,
            },
            {
              value: "winner-court",
              title: "Winner court (winners stay on)",
              desc: `One court and a queue. The pair that wins keeps the court and its partnership; the pair that loses goes to the back of the line, and the next two waiting come on to challenge. Needs at least ${MIN_WINNER_COURT_PLAYERS} players — four on court and a pair waiting.`,
            },
            {
              value: "mixed-americano",
              title: "Mixed americano (two groups, own winners)",
              desc: `A plain americano rotation over the whole field — partners can come from either group — but the two groups are ranked separately, so each has its own winner. Enter one group and then the other. If you want every PAIR to be one from each group, pick the mixicano instead.`,
            },
            {
              value: "mixicano",
              title: "Mixicano (pairs across two groups)",
              desc: `Enter two equal groups — in a mixed session, everyone from one side of the draw and then the other. Every pair is one player from each group, you get a new partner from the other group each round, and scoring is individual. Needs a multiple of four players.`,
            },
            {
              value: "mixed-team-americano",
              title: "Mixed team americano (two sides, mixed pairs)",
              desc: `The team americano with every pair mixed within its own side. Enter it in quarters: team A's first half, team A's second half, then team B's two halves. You always partner someone from the other half of YOUR team, play the other team, and every point goes to your team's total. Needs a multiple of four players, at least ${MIN_MIXED_TEAM_PLAYERS}.`,
            },
            {
              value: "team-americano",
              title: "Team americano (two sides)",
              desc: `Two fixed teams, entered one after the other. Every round you partner someone else from your own team and play two from the other side, and every point you win goes to your team's total. Needs a multiple of four players, at least ${MIN_TEAM_AMERICANO_PLAYERS}.`,
            },
            {
              value: "king-court",
              title: "King of the court (climb the ladder)",
              desc: `Courts are ranked, and the king court is the top one. Each round every court plays its own match: the two winners move up a court, the two losers move down, and your partner is always someone arriving from the other direction. Needs a multiple of four players, at least ${MIN_KING_COURT_PLAYERS}.`,
            },
            {
              value: "mexicano",
              title: "Mexicano (partners by standing)",
              desc: `Like the americano, but each round is drawn from the table rather than fixed in advance: the top four play each other, then the next four, and within each four the leader partners the fourth. Win and you move up into tougher company. Needs at least ${MIN_MEXICANO_PLAYERS} players.`,
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
                // These are always a short race to a points total — that
                // running total IS the tournament, so sets would make no sense.
                if (
                  opt.value === "americano" ||
                  opt.value === "mexicano" ||
                  opt.value === "king-court" ||
                  opt.value === "team-americano" ||
                  opt.value === "mixicano" ||
                  opt.value === "winner-court" ||
                  opt.value === "mixed-mexicano" ||
                  opt.value === "mixed-americano" ||
                  opt.value === "mixed-team-americano"
                ) {
                  setTiebreakMode("race-to-16");
                  setBestOfSets(1);
                  setRaceTarget(16);
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
            {americano ? (
              <button onClick={loadAmericanoDemo} type="button" className="text-xs text-gold underline underline-offset-4">
                Load 8 demo players
              </button>
            ) : (
              <button onClick={loadGroupDraw} type="button" className="text-xs text-gold underline underline-offset-4">
                Load example group (7 {entrantsLabel.toLowerCase()})
              </button>
            )}
          </div>

          <div className="grid gap-1.5">
            {rrNames.map((n, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-court-line bg-court-panel px-2 py-1.5">
                <span className="w-6 shrink-0 text-xs text-white/30 font-mono text-center">{i + 1}</span>
                <input
                  value={n}
                  onChange={(e) => updateRrName(i, e.target.value)}
                  placeholder={`${entrantLabel} ${i + 1}${!americano && discipline === "doubles" ? " (e.g. Alpha/Bravo)" : ""}`}
                  className="flex-1 min-w-0 bg-court-panel2 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-gold/50"
                />
                {rrNames.length > (americano ? MIN_AMERICANO_PLAYERS : 3) && (
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
          {americano ? (
            <p
              className={`text-xs mt-3 ${
                (mixedTeam
                  ? isValidMixedTeamField(amPlayerCount)
                  : mixedAmericano
                  ? amPlayerCount >= MIN_AMERICANO_PLAYERS && amPlayerCount % 2 === 0
                  : mixedMexicano
                  ? isValidMixedMexicanoField(amPlayerCount)
                  : winnerCourt
                  ? isValidWinnerCourtField(amPlayerCount)
                  : mixicano
                  ? isValidMixicanoField(amPlayerCount)
                  : teamAmericano
                  ? isValidTeamField(amPlayerCount)
                  : kingCourt
                  ? isValidKingCourtField(amPlayerCount)
                  : amPlayerCount >= MIN_AMERICANO_PLAYERS)
                  ? "text-white/40"
                  : "text-live"
              }`}
            >
              {mixedTeam
                ? isValidMixedTeamField(amPlayerCount)
                  ? `${amPlayerCount} players → two teams of ${mixedTeamSize(amPlayerCount)}, each split into halves of ${mixedTeamHalfSize(amPlayerCount)}. ${mixedTeamMatchesPerRound(amPlayerCount)} match${
                      mixedTeamMatchesPerRound(amPlayerCount) === 1 ? "" : "es"
                    } per round.`
                  : `A mixed team americano needs a multiple of four players, at least ${MIN_MIXED_TEAM_PLAYERS} — two teams that each split into halves. Currently ${amPlayerCount}.`
                : mixedAmericano
                ? amPlayerCount >= MIN_AMERICANO_PLAYERS && amPlayerCount % 2 === 0
                  ? `${amPlayerCount} players → two groups of ${amPlayerCount / 2}, ranked separately. Partners are drawn from the whole field.`
                  : `A mixed americano needs an even number of players, at least ${MIN_AMERICANO_PLAYERS}. Currently ${amPlayerCount}.`
                : mixedMexicano
                ? isValidMixedMexicanoField(amPlayerCount)
                  ? `${amPlayerCount} players → two groups of ${mixedGroupSize(amPlayerCount)}, ${mixedMexMatchesPerRound(amPlayerCount)} match${
                      mixedMexMatchesPerRound(amPlayerCount) === 1 ? "" : "es"
                    } per round. Every pair is one from each group, and the courts follow the standings.`
                  : `A mixed mexicano needs a multiple of four players, at least ${MIN_MIXED_MEXICANO_PLAYERS} — two equal groups. Currently ${amPlayerCount}.`
                : winnerCourt
                ? isValidWinnerCourtField(amPlayerCount)
                  ? `${amPlayerCount} players → four on court, ${waitingCount(amPlayerCount)} waiting. One match at a time.`
                  : `A winner court needs at least ${MIN_WINNER_COURT_PLAYERS} players — four on court and a pair waiting. Currently ${amPlayerCount}.`
                : mixicano
                ? isValidMixicanoField(amPlayerCount)
                  ? `${amPlayerCount} players → two groups of ${groupSize(amPlayerCount)}, ${mixicanoMatchesPerRound(amPlayerCount)} match${
                      mixicanoMatchesPerRound(amPlayerCount) === 1 ? "" : "es"
                    } per round. Every pair is one from each group.`
                  : `A mixicano needs a multiple of four players, at least ${MIN_MIXICANO_PLAYERS} — two equal groups. Currently ${amPlayerCount}.`
                : teamAmericano
                ? isValidTeamField(amPlayerCount)
                  ? `${amPlayerCount} players → two teams of ${teamSize(amPlayerCount)}, ${teamMatchesPerRound(amPlayerCount)} match${
                      teamMatchesPerRound(amPlayerCount) === 1 ? "" : "es"
                    } per round. The first ${teamSize(amPlayerCount)} names are ${teamName(1)}, the rest ${teamName(2)}.`
                  : `A team americano needs a multiple of four players, at least ${MIN_TEAM_AMERICANO_PLAYERS} — two equal teams that each split into pairs. Currently ${amPlayerCount}.`
                : kingCourt
                ? isValidKingCourtField(amPlayerCount)
                  ? `${amPlayerCount} players → a ladder of ${courtCount(amPlayerCount)} courts, everyone playing every round.`
                  : `King of the court needs a multiple of four players, at least ${MIN_KING_COURT_PLAYERS} — every rung of the ladder has to be full. Currently ${amPlayerCount}.`
                : amPlayerCount < MIN_AMERICANO_PLAYERS
                ? `Enter at least ${MIN_AMERICANO_PLAYERS} players — a round needs four people on court.`
                : `${amPlayerCount} players → ${matchesPerRound(amPlayerCount)} match${
                    matchesPerRound(amPlayerCount) === 1 ? "" : "es"
                  } per round${amPlayerCount % 4 !== 0 ? `, with ${amPlayerCount % 4} sitting out each round (taking turns)` : ""}.`}
            </p>
          ) : format === "two-group" ? (
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

      {americano && (
        <section className="mb-6">
          <h2 className="font-display uppercase text-lg text-white/80 mb-1">Rounds</h2>
          <p className="text-white/40 text-xs mb-3">
            {mixedTeam
              ? `How many times you change partner within your team.${
                  isValidMixedTeamField(amPlayerCount)
                    ? ` With halves of ${mixedTeamHalfSize(amPlayerCount)} there are ${maxMixedTeamRounds(amPlayerCount)} rounds before anyone repeats a partner.`
                    : ""
                }`
              : mixedAmericano
              ? `How many times everyone changes partners.${
                  amPlayerCount >= MIN_AMERICANO_PLAYERS
                    ? ` With ${amPlayerCount} players you can play up to ${amPlayerCount - 1} rounds before anyone has to repeat a partner.`
                    : ""
                }`
              : mixedMexicano
              ? "How many times the table is redrawn. Each round is made from the standings at that moment, with every pair still crossing the two groups."
              : winnerCourt
              ? "How many matches are played in total. Only one match is on at a time, so this is the length of the whole session."
              : mixicano
              ? `How many times you change partner across the groups.${
                  isValidMixicanoField(amPlayerCount)
                    ? ` With groups of ${groupSize(amPlayerCount)} there are ${maxMixicanoRounds(amPlayerCount)} rounds before anyone repeats a partner.`
                    : ""
                }`
              : teamAmericano
              ? `How many times you change partner within your team.${
                  isValidTeamField(amPlayerCount)
                    ? ` A team of ${teamSize(amPlayerCount)} has ${maxTeamRounds(amPlayerCount)} rounds before anyone repeats a team-mate.`
                    : ""
                }`
              : kingCourt
              ? "How many rounds are played. After each one the winners on every court move up a rung and the losers move down, so where you finish is where you climbed to."
              : mexicano
              ? "How many times the table is redrawn. Each round is made from the standings at that moment, so partners and opponents follow your results."
              : `How many times everyone changes partners.${
                  MIN_AMERICANO_PLAYERS <= amPlayerCount
                    ? ` With ${amPlayerCount} players you can play up to ${amPlayerCount - 1} rounds before anyone has to repeat a partner.`
                    : ""
                }`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {[4, 5, 6, 7, 8, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAmRounds(n)}
                className={`rounded-xl px-4 py-2.5 font-display text-sm border ${
                  effectiveRounds === n ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/60"
                }`}
              >
                {n}
              </button>
            ))}
            <label className="flex items-center gap-2 ml-1">
              <span className="text-white/40 text-xs uppercase tracking-widest">Custom</span>
              <input
                value={[4, 5, 6, 7, 8, 10].includes(effectiveRounds) ? "" : String(effectiveRounds)}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isInteger(n)) setAmRounds(Math.max(1, Math.min(MAX_AMERICANO_ROUNDS, n)));
                }}
                placeholder="…"
                inputMode="numeric"
                className="w-16 bg-court-panel2 border border-court-line rounded-lg px-2 py-2 text-sm text-center outline-none focus:ring-2 ring-gold/50"
              />
            </label>
          </div>

          {mtPreview && (
            <div className="mt-4 rounded-xl border border-court-line bg-court-panel p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <p className="font-display uppercase text-sm text-gold">The two teams, split in halves</p>
                <p className="text-white/40 text-xs">
                  {mtPreview.matches.length} matches ·{" "}
                  {mtPreview.quality.repeatedPartnerships === 0
                    ? "nobody repeats a partner"
                    : `${mtPreview.quality.repeatedPartnerships} repeated partner${
                        mtPreview.quality.repeatedPartnerships === 1 ? "" : "s"
                      }`}
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 mb-3">
                {[0, 1].map((t) => (
                  <div key={t} className="rounded-lg bg-court-panel2 px-3 py-2">
                    <p className="font-display uppercase text-[10px] tracking-[0.25em] text-gold mb-1">{teamName(t + 1)}</p>
                    {[0, 1].map((h) => (
                      <div key={h} className="mb-1 last:mb-0">
                        <p className="text-white/30 text-[10px] uppercase tracking-widest">Half {h + 1}</p>
                        {mtPreview.quarters[t * 2 + h].map((n) => (
                          <p key={n} className="text-xs text-white/75 truncate py-0.5">
                            {n}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                {Array.from({ length: effectiveRounds }, (_, r) => (
                  <div key={r} className="rounded-lg bg-court-panel2 px-3 py-2">
                    <p className="font-display uppercase text-[10px] tracking-[0.25em] text-white/35 mb-1">Round {r + 1}</p>
                    {mtPreview.matches
                      .filter((m) => m.round === r + 1)
                      .map((m) => (
                        <p key={m.posIndex} className="text-xs text-white/75 truncate py-0.5">
                          {mtPreview.names[m.team1[0]]} &amp; {mtPreview.names[m.team1[1]]}
                          <span className="text-white/30 mx-1.5">vs</span>
                          {mtPreview.names[m.team2[0]]} &amp; {mtPreview.names[m.team2[1]]}
                        </p>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {maGroups && (
            <div className="mt-4 rounded-xl border border-court-line bg-court-panel p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <p className="font-display uppercase text-sm text-gold">The two groups</p>
                <p className="text-white/40 text-xs">Ranked separately · partners drawn from everyone</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {maGroups.map((members, i) => (
                  <div key={i} className="rounded-lg bg-court-panel2 px-3 py-2">
                    <p className="font-display uppercase text-[10px] tracking-[0.25em] text-gold mb-1">
                      {mixicanoGroupName(i + 1)}
                    </p>
                    {members.map((n) => (
                      <p key={n} className="text-xs text-white/75 truncate py-0.5">
                        {n}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mmPreview && (
            <div className="mt-4 rounded-xl border border-court-line bg-court-panel p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <p className="font-display uppercase text-sm text-gold">Round 1</p>
                <p className="text-white/40 text-xs">Drawn from the order below · later rounds follow the table</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 mb-3">
                {mmPreview.groups.map((members, i) => (
                  <div key={i} className="rounded-lg bg-court-panel2 px-3 py-2">
                    <p className="font-display uppercase text-[10px] tracking-[0.25em] text-gold mb-1">
                      {mixicanoGroupName(i + 1)}
                    </p>
                    {members.map((n) => (
                      <p key={n} className="text-xs text-white/75 truncate py-0.5">
                        {n}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid gap-2">
                {mmPreview.round.map((m) => (
                  <div key={m.posIndex} className="rounded-lg bg-court-panel2 px-3 py-2">
                    <p className="font-display uppercase text-[10px] tracking-[0.25em] text-white/35 mb-1">
                      {m.posIndex === 0 ? "Top court" : `Court ${m.posIndex + 1}`}
                    </p>
                    <p className="text-xs text-white/75 truncate">
                      {mmPreview.names[m.team1[0]]} &amp; {mmPreview.names[m.team1[1]]}
                      <span className="text-white/30 mx-1.5">vs</span>
                      {mmPreview.names[m.team2[0]]} &amp; {mmPreview.names[m.team2[1]]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {wcPreview && (
            <div className="mt-4 rounded-xl border border-court-line bg-court-panel p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <p className="font-display uppercase text-sm text-gold">The opening match</p>
                <p className="text-white/40 text-xs">Winners stay on · losers go to the back</p>
              </div>
              <div className="rounded-lg bg-court-panel2 px-3 py-2 mb-2">
                <p className="text-xs text-white/75 truncate">
                  {wcPreview.team1[0]} &amp; {wcPreview.team1[1]}
                  <span className="text-white/30 mx-1.5">vs</span>
                  {wcPreview.team2[0]} &amp; {wcPreview.team2[1]}
                </p>
              </div>
              <p className="font-display uppercase text-[10px] tracking-[0.25em] text-white/35 mb-1">
                Waiting, in order
              </p>
              <p className="text-xs text-white/60">{wcPreview.queue.join(" · ")}</p>
            </div>
          )}

          {mixPreview && (
            <div className="mt-4 rounded-xl border border-court-line bg-court-panel p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <p className="font-display uppercase text-sm text-gold">The two groups</p>
                <p className="text-white/40 text-xs">
                  {mixPreview.matches.length} matches ·{" "}
                  {mixPreview.quality.repeatedPartnerships === 0
                    ? "nobody repeats a partner"
                    : `${mixPreview.quality.repeatedPartnerships} repeated partner${
                        mixPreview.quality.repeatedPartnerships === 1 ? "" : "s"
                      }`}
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 mb-3">
                {mixPreview.groups.map((members, i) => (
                  <div key={i} className="rounded-lg bg-court-panel2 px-3 py-2">
                    <p className="font-display uppercase text-[10px] tracking-[0.25em] text-gold mb-1">
                      {mixicanoGroupName(i + 1)}
                    </p>
                    {members.map((n) => (
                      <p key={n} className="text-xs text-white/75 truncate py-0.5">
                        {n}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                {Array.from({ length: effectiveRounds }, (_, r) => (
                  <div key={r} className="rounded-lg bg-court-panel2 px-3 py-2">
                    <p className="font-display uppercase text-[10px] tracking-[0.25em] text-white/35 mb-1">Round {r + 1}</p>
                    {mixPreview.matches
                      .filter((m) => m.round === r + 1)
                      .map((m) => (
                        <p key={m.posIndex} className="text-xs text-white/75 truncate py-0.5">
                          {mixPreview.names[m.team1[0]]} &amp; {mixPreview.names[m.team1[1]]}
                          <span className="text-white/30 mx-1.5">vs</span>
                          {mixPreview.names[m.team2[0]]} &amp; {mixPreview.names[m.team2[1]]}
                        </p>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {taPreview && (
            <div className="mt-4 rounded-xl border border-court-line bg-court-panel p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <p className="font-display uppercase text-sm text-gold">The two teams</p>
                <p className="text-white/40 text-xs">
                  {taPreview.matches.length} matches ·{" "}
                  {taPreview.quality.repeatedPartnerships === 0
                    ? "nobody repeats a team-mate"
                    : `${taPreview.quality.repeatedPartnerships} repeated team-mate${
                        taPreview.quality.repeatedPartnerships === 1 ? "" : "s"
                      }`}
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 mb-3">
                {taPreview.teams.map((members, i) => (
                  <div key={i} className="rounded-lg bg-court-panel2 px-3 py-2">
                    <p className="font-display uppercase text-[10px] tracking-[0.25em] text-gold mb-1">{teamName(i + 1)}</p>
                    {members.map((n) => (
                      <p key={n} className="text-xs text-white/75 truncate py-0.5">
                        {n}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                {Array.from({ length: effectiveRounds }, (_, r) => (
                  <div key={r} className="rounded-lg bg-court-panel2 px-3 py-2">
                    <p className="font-display uppercase text-[10px] tracking-[0.25em] text-white/35 mb-1">Round {r + 1}</p>
                    {taPreview.matches
                      .filter((m) => m.round === r + 1)
                      .map((m) => (
                        <p key={m.posIndex} className="text-xs text-white/75 truncate py-0.5">
                          {taPreview.names[m.team1[0]]} &amp; {taPreview.names[m.team1[1]]}
                          <span className="text-white/30 mx-1.5">vs</span>
                          {taPreview.names[m.team2[0]]} &amp; {taPreview.names[m.team2[1]]}
                        </p>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {kcPreview && (
            <div className="mt-4 rounded-xl border border-court-line bg-court-panel p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <p className="font-display uppercase text-sm text-gold">Opening ladder</p>
                <p className="text-white/40 text-xs">Winners move up · losers move down</p>
              </div>
              <div className="grid gap-2">
                {kcPreview.rungs.map((r) => (
                  <div key={r.level} className="rounded-lg bg-court-panel2 px-3 py-2">
                    <p
                      className={`font-display uppercase text-[10px] tracking-[0.25em] mb-1 ${
                        r.level === 0 ? "text-gold" : "text-white/35"
                      }`}
                    >
                      {r.level === 0 ? "👑 " : ""}
                      {courtLevelName(r.level)}
                    </p>
                    <p className="text-xs text-white/75 truncate">
                      {kcPreview.names[r.team1[0]]} &amp; {kcPreview.names[r.team1[1]]}
                      <span className="text-white/30 mx-1.5">vs</span>
                      {kcPreview.names[r.team2[0]]} &amp; {kcPreview.names[r.team2[1]]}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mxPreview && (
            <div className="mt-4 rounded-xl border border-court-line bg-court-panel p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <p className="font-display uppercase text-sm text-gold">Round 1</p>
                <p className="text-white/40 text-xs">Drawn from the order above · later rounds follow the table</p>
              </div>
              <div className="grid gap-2">
                {mxPreview.pairs.map((p) => (
                  <div key={p.posIndex} className="rounded-lg bg-court-panel2 px-3 py-2">
                    <p className="font-display uppercase text-[10px] tracking-[0.25em] text-white/35 mb-1">
                      {p.posIndex === 0 ? "Top four" : `Places ${p.posIndex * 4 + 1}–${p.posIndex * 4 + 4}`}
                    </p>
                    <p className="text-xs text-white/75 truncate">
                      {mxPreview.names[p.team1[0]]} &amp; {mxPreview.names[p.team1[1]]}
                      <span className="text-white/30 mx-1.5">vs</span>
                      {mxPreview.names[p.team2[0]]} &amp; {mxPreview.names[p.team2[1]]}
                    </p>
                  </div>
                ))}
                {mxPreview.sitting.length > 0 && (
                  <p className="text-[11px] text-white/30">Sitting out round 1: {mxPreview.sitting.join(", ")}</p>
                )}
              </div>
            </div>
          )}

          {amPreview && (
            <div className="mt-4 rounded-xl border border-court-line bg-court-panel p-4">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <p className="font-display uppercase text-sm text-gold">Rotation preview</p>
                <p className="text-white/40 text-xs">
                  {amPreview.schedule.matches.length} matches ·{" "}
                  {amPreview.quality.minMatches === amPreview.quality.maxMatches
                    ? `${amPreview.quality.minMatches} each`
                    : `${amPreview.quality.minMatches}–${amPreview.quality.maxMatches} each`}
                  {amPreview.quality.repeatedPartnerships === 0
                    ? " · nobody repeats a partner"
                    : ` · ${amPreview.quality.repeatedPartnerships} repeated partnership${
                        amPreview.quality.repeatedPartnerships === 1 ? "" : "s"
                      }`}
                </p>
              </div>
              <div className="grid gap-2 max-h-72 overflow-y-auto pr-1">
                {Array.from({ length: effectiveRounds }, (_, r) => {
                  const round = r + 1;
                  const roundMatches = amPreview.schedule.matches.filter((m) => m.round === round);
                  const sitting = amPreview.schedule.sitOuts[r] ?? [];
                  const nameOf = (i: number) => rrNames.filter((n) => n.trim())[i]?.trim() ?? `#${i + 1}`;
                  return (
                    <div key={round} className="rounded-lg bg-court-panel2 px-3 py-2">
                      <p className="font-display uppercase text-[10px] tracking-[0.25em] text-white/35 mb-1">Round {round}</p>
                      {roundMatches.map((m) => (
                        <p key={m.posIndex} className="text-xs text-white/75 truncate py-0.5">
                          {nameOf(m.team1[0])} &amp; {nameOf(m.team1[1])}
                          <span className="text-white/30 mx-1.5">vs</span>
                          {nameOf(m.team2[0])} &amp; {nameOf(m.team2[1])}
                        </p>
                      ))}
                      {sitting.length > 0 && (
                        <p className="text-[11px] text-white/30 mt-0.5">Sitting out: {sitting.map(nameOf).join(", ")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
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
          {tiebreakOptions(raceTarget).map((opt) => (
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

        {isPointsRace(tiebreakMode) && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-xl border border-gold/30 bg-court-panel p-4"
          >
            <div>
              <p className="font-display uppercase text-sm text-white/80 mb-2">Race target</p>
              <div className="flex flex-wrap items-center gap-2">
                {RACE_TARGET_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRaceTarget(n)}
                    className={`rounded-xl px-4 py-2.5 font-display text-sm border ${
                      raceTarget === n ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/60"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <label className="flex items-center gap-2 ml-1">
                  <span className="text-white/40 text-xs uppercase tracking-widest">Custom</span>
                  <input
                    value={RACE_TARGET_PRESETS.includes(raceTarget) ? "" : String(raceTarget)}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isInteger(n)) setRaceTarget(Math.max(4, Math.min(99, n)));
                    }}
                    placeholder="…"
                    inputMode="numeric"
                    className="w-16 bg-court-panel2 border border-court-line rounded-lg px-2 py-2 text-sm text-center outline-none focus:ring-2 ring-gold/50"
                  />
                </label>
              </div>
              <p className="text-white/40 text-xs mt-2">
                {tiebreakMode === "race-to-16"
                  ? `First side to ${raceTarget} points takes the match.`
                  : `Play stops at ${2 * raceTarget - 2} total points; whoever has more wins (a typical winning score is ${raceTarget}).`}
              </p>
            </div>

            <div className="mt-4 pt-4 border-t border-court-line">
              <p className="font-display uppercase text-sm text-white/80 mb-2">Serve changes every</p>
              <div className="flex flex-wrap items-center gap-2">
                {SERVE_EVERY_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setServeEvery(n)}
                    className={`rounded-xl px-4 py-2.5 font-display text-sm border ${
                      serveEvery === n ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/60"
                    }`}
                  >
                    {n} pts
                  </button>
                ))}
                <label className="flex items-center gap-2 ml-1">
                  <span className="text-white/40 text-xs uppercase tracking-widest">Custom</span>
                  <input
                    value={SERVE_EVERY_PRESETS.includes(serveEvery) ? "" : String(serveEvery)}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isInteger(n)) setServeEvery(Math.max(1, Math.min(10, n)));
                    }}
                    placeholder="…"
                    inputMode="numeric"
                    className="w-16 bg-court-panel2 border border-court-line rounded-lg px-2 py-2 text-sm text-center outline-none focus:ring-2 ring-gold/50"
                  />
                </label>
              </div>
              <p className="text-white/40 text-xs mt-2">
                Each side serves {serveEvery} point{serveEvery === 1 ? "" : "s"} in a row, then it changes hands. The TVs and coach phones
                show whose serve it is and how many serves are left.
              </p>
            </div>
          </motion.div>
        )}
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
