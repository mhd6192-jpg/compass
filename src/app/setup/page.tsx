"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import ClubLogo from "@/components/shared/ClubLogo";
import { arrangeDraw } from "@/lib/bracket/seedArrange";

import {
  entrantWordCap,
  entrantsArePeople,
  isPointsRace,
  isRotatingPartners,
  isTwoGroupEntry,
  matchFormatLabel,
  type TiebreakMode,
  type TournamentFormat,
} from "@/lib/types";
import { MIN_TWO_GROUP_TEAMS, splitGroups, twoGroupMatchCount } from "@/lib/bracket/twoGroup";
import { FORMAT_FAMILIES, courtsUsedBy, describeField, formatsInFamily, maxRoundsFor, validateField } from "@/lib/bracket/formats";
import { surplusCourtNote } from "@/lib/bracket/courtLoad";
import { boxText, commitOnBlur, commitWhileTyping, parseSeedInput, sanitizeNumericText } from "@/lib/numericInput";

interface SavedRoster {
  id: string;
  label: string;
  names: string[];
  format: string | null;
  updatedAt: string;
}
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
import { nameKeyOf, orderByStrength } from "@/lib/members";
import { courtCount, courtLevelName, isValidKingCourtField, openingLadder, MIN_KING_COURT_PLAYERS } from "@/lib/bracket/kingCourt";
import {
  defaultTeamRounds,
  generateTeamAmericano,
  isValidTeamField,
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
  mixicanoGroupName,
  mixicanoScheduleQuality,
  matchesPerRound as mixicanoMatchesPerRound,
  MIN_MIXICANO_PLAYERS,
} from "@/lib/bracket/mixicano";
import {
  defaultWinnerCourtRounds,
  isValidWinnerCourtField,
  neverPlaying,
  openingRound,
  roundsForEveryone,
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
  mixedTeamScheduleQuality,
  teamSize as mixedTeamSize,
  matchesPerRound as mixedTeamMatchesPerRound,
  MIN_MIXED_TEAM_PLAYERS,
} from "@/lib/bracket/mixedTeamAmericano";

/** Each option describes itself with the numbers actually chosen — the set length for the set modes, the target for the races. */
function tiebreakOptions(target: number, winBy: 1 | 2, games: number): { value: TiebreakMode; title: string; desc: string }[] {
  const total = 2 * target - 2;
  return [
    {
      value: "standard",
      title: "Standard tiebreak",
      desc: `Every set (including the decider) goes to ${games} game${games === 1 ? "" : "s"}, win by 2, with a 7-point tiebreak at ${games}-${games}.`,
    },
    {
      value: "match-tiebreak",
      title: "Fast deciding set",
      desc: "Sets 1 & 2 use the standard tiebreak. The deciding set is replaced by a single 10-point match tiebreak to keep things moving.",
    },
    {
      value: "advantage",
      title: "Advantage sets",
      desc: `No tiebreaks at all — sets play out to a 2-game lead past ${games}-${games}, however long that takes.`,
    },
    {
      value: "race-to-9",
      title: `${total} points total`,
      desc: `No games or sets — every point is played out until ${total} total points are in, then whoever has more wins (e.g. ${target}-${target - 2}). If it's ${target - 1}-${target - 1}, one sudden-death point decides it (${target}-${target - 1}).`,
    },
    {
      value: "race-to-16",
      title: winBy === 2 ? `Race to ${target}, win by 2` : `Race to ${target}`,
      desc:
        winBy === 2
          ? `No games or sets — first side to ${target} points AND two clear. At ${target - 1}-${target - 1} it carries on like a tiebreak until someone leads by two (${target + 1}-${target - 1}, ${target + 2}-${target}, and so on).`
          : `No games or sets — first side to ${target} points wins, no need to lead by two. At ${target - 1}-${target - 1} it's sudden death: the next point takes it ${target}-${target - 1}.`,
    },
  ];
}

const RACE_TARGET_PRESETS = [9, 11, 16, 18, 21];
const SERVE_EVERY_PRESETS = [2, 3, 4, 5];
const GAMES_PER_SET_PRESETS = [4, 6, 8, 9];
const ROUNDS_PRESETS = [4, 5, 6, 7, 8, 10];
/** Best-of has to be odd or the match can end level, so these are all of them up to nine. */
const BEST_OF_PRESETS = [1, 3, 5, 7, 9];

/**
 * A row of preset numbers with a box for anything else.
 *
 * The box holds the ORGANISER'S TEXT, not the committed number. Binding it
 * straight to the value — `value={presets.includes(n) ? "" : String(n)}`, clamp
 * inside onChange — is the obvious way to write this and it makes the control
 * unusable, which is how all three of these behaved:
 *
 *   - typing a number that happens to be a preset blanked the box mid-word,
 *     because the derived value went back to "";
 *   - the box could not be cleared: `parseInt("")` is NaN, the guard skipped the
 *     update, and the old number snapped straight back into the field;
 *   - clamping every keystroke meant a two-digit number starting below the
 *     minimum was impossible — typing "18" into the race target gave "1" →
 *     clamped to 4 → the box now read "4" and there was no way forward.
 *
 * So the draft is kept as a string while the field is being edited, the model is
 * updated only when the text is already a legal value, and the clamp happens
 * once on blur where the organiser can see it happen.
 */
function NumberChoice({
  value,
  onChange,
  presets,
  min,
  max,
  label,
  chipLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  presets: number[];
  min: number;
  max: number;
  /** Describes the field for screen readers, e.g. "race target". */
  label: string;
  chipLabel?: (n: number) => string;
}) {
  // The rules themselves live in lib/numericInput.ts, where they can be tested.
  // This component holds only the draft string.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => {
            setDraft(null);
            onChange(n);
          }}
          className={`rounded-xl px-4 py-2.5 font-display text-sm border ${
            value === n ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/60"
          }`}
        >
          {chipLabel ? chipLabel(n) : n}
        </button>
      ))}
      <label className="flex items-center gap-2 ml-1">
        <span className="text-white/40 text-xs uppercase tracking-widest">Custom</span>
        <input
          aria-label={`Custom ${label}`}
          value={boxText(draft, value, presets)}
          onChange={(e) => {
            const text = sanitizeNumericText(e.target.value);
            setDraft(text);
            const n = commitWhileTyping(text, min, max);
            if (n !== null) onChange(n);
          }}
          onBlur={() => {
            if (draft === null) return;
            const n = commitOnBlur(draft, min, max);
            if (n !== null) onChange(n);
            // Either way the box goes back to mirroring the committed value, so
            // an abandoned half-typed number never lingers as if it counted.
            setDraft(null);
          }}
          placeholder="…"
          inputMode="numeric"
          className="w-16 bg-court-panel2 border border-court-line rounded-lg px-2 py-2 text-sm text-center outline-none focus:ring-2 ring-gold/50"
        />
        <span className="text-white/25 text-xs">
          {min}–{max}
        </span>
      </label>
    </div>
  );
}

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
  const mexicano = format === "mexicano";
  const kingCourt = format === "king-court";
  const teamAmericano = format === "team-americano";
  const mixicano = format === "mixicano";
  const winnerCourt = format === "winner-court";
  const mixedMexicano = format === "mixed-mexicano";
  const mixedAmericano = format === "mixed-americano";
  const mixedTeam = format === "mixed-team-americano";
  // All the rotating-partner formats share this whole section of the form. Read
  // from the registry rather than listed here, so a format added there cannot
  // arrive with its own entry section quietly missing.
  const americano = isRotatingPartners(format);
  // The ones needing a full multiple of four rather than merely enough players.
  const needsFours = kingCourt || teamAmericano || mixicano || mixedTeam;
  // Wording only: an entrant is one row in the draw either way. An americano is
  // always entered as individuals, however the club normally plays — the whole
  // point of the format is that the pairs are made up as it goes.
  //
  // The rule comes from the shared helper rather than living here. This form
  // used to own the only copy of it, which is exactly how every other screen
  // came to call a singles entrant a team.
  const entrantLabel = entrantWordCap(format, discipline);
  const entrantsLabel = entrantWordCap(format, discipline, true);
  const [names, setNames] = useState<string[]>(Array(16).fill(""));
  const [rrNames, setRrNames] = useState<string[]>(Array(7).fill(""));
  const [seeds, setSeeds] = useState<(number | "")[]>(Array(16).fill(""));
  const [arrange, setArrange] = useState(true);
  const [bestOfSets, setBestOfSets] = useState(1);
  const [tiebreakMode, setTiebreakMode] = useState<TiebreakMode>("standard");
  const [amRounds, setAmRounds] = useState(0); // 0 = use the default for the field size
  const [raceTarget, setRaceTarget] = useState(16);
  const [raceWinBy, setRaceWinBy] = useState<1 | 2>(1);
  const [serveEvery, setServeEvery] = useState(4);
  const [gamesPerSet, setGamesPerSet] = useState(6);
  /**
   * The set-play scoring the organiser had before a rotating format overwrote
   * it with a race — so going back to a bracket draw gives it back rather than
   * leaving them on a race they never chose.
   */
  const [setPlayChoice, setSetPlayChoice] = useState<{ tiebreakMode: TiebreakMode; bestOfSets: number; gamesPerSet: number } | null>(null);
  const [pin, setPin] = useState("");
  // Separate from the coach PIN: this one authorises creating and wiping events.
  const [orgPin, setOrgPin] = useState("");
  const [newOrgPin, setNewOrgPin] = useState("");
  const [changingOrgPin, setChangingOrgPin] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  /** What the server reported it did with the organiser PIN, for the success screen. */
  const [orgPinChanged, setOrgPinChanged] = useState(false);
  /** Set when the seed landed but the reply never came back. */
  const [lostReplyNote, setLostReplyNote] = useState<string | null>(null);
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
    // The example list is pairs ("Alpha/Bravo"), which only reads correctly in
    // a doubles draw. Loaded into a singles one it put seven slash-separated
    // names on the scoreboard as if each were a person, so the demo itself
    // says which it is.
    setDiscipline("doubles");
    setRrNames(GROUP_DRAW);
    if (!pin) setPin("1234");
  }
  function loadAmericanoDemo() {
    setRrNames(Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`));
    if (!pin) setPin("1234");
  }
  // --- saved entrant lists -------------------------------------------------
  // Resetting a draw deletes the Player rows, which is exactly when an
  // organiser is re-running the same group and does not want to retype anyone.
  const [rosters, setRosters] = useState<SavedRoster[]>([]);
  const [rosterLabel, setRosterLabel] = useState("");
  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterNote, setRosterNote] = useState<string | null>(null);

  const refreshRosters = () =>
    fetch("/api/rosters")
      .then((r) => r.json())
      .then((d) => setRosters(d.rosters ?? []))
      .catch(() => setRosters([]));

  useEffect(() => {
    void refreshRosters();
  }, []);

  // --- names the club already knows ------------------------------------------
  // Entrants are matched to their record by name, so a new spelling of somebody
  // who already exists quietly forks them into two people. Offering the names
  // back as you type is the cheapest place to stop that happening — far cheaper
  // than merging the two halves afterwards.
  const [knownNames, setKnownNames] = useState<string[]>([]);
  /** Mean finishing position per person, for putting the entry list in order. */
  const [standings, setStandings] = useState<Map<string, number>>(new Map());
  const [orderNote, setOrderNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/members/names")
      .then((r) => r.json())
      .then((d) => setKnownNames(d.names ?? []))
      .catch(() => setKnownNames([]));
    fetch("/api/members")
      .then((r) => r.json())
      .then((d: { members?: { name: string; standing: number }[] }) =>
        setStandings(new Map((d.members ?? []).map((m) => [nameKeyOf(m.name), m.standing])))
      )
      .catch(() => setStandings(new Map()));
  }, []);

  /**
   * Whether ordering the entry list by past results is meaningful here.
   *
   * It needs three things: entrants who are people rather than pairs, a format
   * that reads the order as a ranking rather than as group membership, and a
   * club with some history to order from.
   */
  const canOrderByStrength =
    entrantsArePeople(format, discipline) && !isTwoGroupEntry(format) && format !== "compass" && standings.size > 0;

  /**
   * Puts the entry list in strength order.
   *
   * Only offered where the order actually means something. A mexicano reads it
   * as a ranking and draws round one off it; the two-group formats read it as
   * membership, and sorting those by strength would quietly put every strong
   * player in one half.
   */
  function orderEntrantsByStrength() {
    const typed = rrNames.map((n) => n.trim());
    const { ordered, ranked, unranked } = orderByStrength(typed.filter(Boolean), standings);
    setRrNames([...ordered, ...typed.filter((n) => !n).map(() => "")]);
    setOrderNote(
      unranked.length === 0
        ? `Ordered ${ranked} from past results — strongest first.`
        : `Ordered ${ranked} from past results. ${unranked.join(", ")} ${
            unranked.length === 1 ? "has" : "have"
          } not played here before, so they are at the bottom — move them up if you know better.`
    );
  }

  /**
   * A list that is in strength order, in a format that reads it as membership.
   *
   * "Order by past results" is only OFFERED where the order is a ranking, but
   * an organiser can sort under a mexicano and then switch to a team americano,
   * and the list comes with them. Those formats take the first half as one side
   * and the rest as the other, so a sorted list hands every strong player to
   * team A and the evening is over before it starts. The button cannot warn
   * about this, because by then it is no longer on screen.
   *
   * The alternating `two-group` bracket draw is deliberately not included: it
   * deals the list out A, B, A, B, so strength order BALANCES it.
   */
  const strengthStacked = useMemo(() => {
    if (!isTwoGroupEntry(format) || standings.size === 0) return false;
    const ranked = rrNames
      .map((n) => standings.get(nameKeyOf(n)))
      .filter((s): s is number => typeof s === "number");
    if (ranked.length < 4) return false;
    return ranked.every((s, i) => i === 0 || ranked[i - 1] >= s);
  }, [format, rrNames, standings]);

  /** The names currently typed in, for whichever entry list this format uses. */
  const currentNames = () => (format === "compass" ? names : rrNames).map((n) => n.trim()).filter(Boolean);

  async function saveRoster() {
    const list = currentNames();
    const label = rosterLabel.trim();
    setRosterNote(null);
    if (!label) return setRosterNote("Give the list a name first.");
    if (list.length < 2) return setRosterNote("Enter at least two entrants first.");
    if (!orgPin.trim()) return setRosterNote("Enter the organiser PIN further down the page first.");
    // Saving under a name that already exists replaces it, and a list is typed
    // once and reused for months — so say so rather than quietly overwriting
    // last season's group with tonight's four.
    const existing = rosters.find((r) => r.label.trim().toLowerCase() === label.toLowerCase());
    if (existing && !confirm(`"${existing.label}" already exists with ${existing.names.length} entrants. Replace it with these ${list.length}?`)) {
      return;
    }
    setRosterBusy(true);
    try {
      const res = await fetch("/api/rosters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The organiser PIN gates writes; it is the same PIN typed below.
        body: JSON.stringify({ label, names: list, format, pin: orgPin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setRosterNote(`Saved "${label}" — ${list.length} entrants.`);
      setRosterLabel("");
      await refreshRosters();
    } catch (e) {
      setRosterNote(e instanceof Error ? e.message : "Could not save");
    } finally {
      setRosterBusy(false);
    }
  }

  function loadRoster(r: SavedRoster) {
    setRosterNote(null);
    if (format === "compass") {
      // The compass draw is exactly sixteen rows, so pad or trim to fit.
      const filled = [...r.names.slice(0, 16), ...Array(Math.max(0, 16 - r.names.length)).fill("")];
      setNames(filled);
      // Seeds are POSITIONAL, and the positions now hold different people. A
      // roster stores only names, so there is nothing to restore — leaving the
      // previous draw's seeds behind meant row 6 of tonight's list inherited
      // whoever was seeded 1 last time, and the bracket was arranged around a
      // seeding the organiser never entered. Both sibling loaders clear them.
      setSeeds(Array(16).fill(""));
      if (r.names.length !== 16) setRosterNote(`"${r.label}" has ${r.names.length} entrants; a compass draw needs exactly 16.`);
    } else {
      setRrNames(r.names.length ? r.names : [""]);
    }
    // No PIN is set here. The demo buttons below may default to 1234 because
    // their whole purpose is a one-tap runnable draw; loading a saved list is a
    // real event, and the coach PIN field shows "e.g. 1234" as its placeholder —
    // so a silently pre-filled 1234 looked exactly like an untouched empty box
    // and the evening ran on the most guessable PIN in existence.
  }

  async function deleteRoster(r: SavedRoster) {
    if (!orgPin.trim()) return setRosterNote("Enter the organiser PIN further down the page first.");
    // The only irreversible control on this page without a confirmation. The
    // × sits inches from Load, and a saved list is typed once and reused for
    // months.
    if (!confirm(`Delete "${r.label}" (${r.names.length} entrants)? It cannot be brought back.`)) return;
    setRosterBusy(true);
    setRosterNote(null);
    try {
      const res = await fetch(`/api/rosters?id=${encodeURIComponent(r.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: orgPin.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRosterNote(data.error ?? "Could not delete that list.");
        return;
      }
      await refreshRosters();
      setRosterNote(`Deleted "${r.label}".`);
    } catch {
      // A dropped connection threw past the `res.ok` check, React swallowed the
      // rejection, and the × simply did nothing with no message at all.
      setRosterNote("No connection — that list was not deleted. Try again in a moment.");
    } finally {
      setRosterBusy(false);
    }
  }

  function updateSeed(i: number, value: string) {
    // null means "not a number" — leave the box exactly as it was, rather than
    // inventing seed 1 from it. See `parseSeedInput`.
    const next = parseSeedInput(value);
    if (next === null) return;
    setSeeds((prev) => prev.map((s, idx) => (idx === i ? next : s)));
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

  /**
   * Live preview of the East Round of 16, and the reason there isn't one.
   *
   * The reason used to be thrown away: two players sharing a seed made
   * `arrangeDraw` throw, the catch returned null, and the whole preview section
   * simply disappeared — no message, nothing marked, and the refusal ("Two
   * players share seed 1") arriving only on Start, naming a number but not a
   * row. So the error is kept, shown next to the seeds, and checked before the
   * POST, the same shape `describeField` uses for the rotating formats.
   */
  const preview = useMemo((): { pairs: [string, string][] | null; error: string | null; duplicates: Set<number> } => {
    const trimmed = names.map((n) => n.trim());

    // Which seed NUMBERS are used more than once, so the offending boxes can be
    // marked rather than the organiser hunting sixteen rows for the clash.
    const seen = new Map<number, number>();
    for (const s of seeds) if (s !== "") seen.set(s as number, (seen.get(s as number) ?? 0) + 1);
    const duplicates = new Set([...seen.entries()].filter(([, count]) => count > 1).map(([seed]) => seed));
    const dupError =
      arrange && duplicates.size > 0
        ? `Two entrants share seed ${[...duplicates].sort((a, b) => a - b).join(" and ")} — every seed has to be different, or clear one of them.`
        : null;

    if (trimmed.some((n) => !n)) return { pairs: null, error: dupError, duplicates };
    let ordered = trimmed;
    if (arrange) {
      try {
        ordered = arrangeDraw(trimmed.map((n, i) => ({ name: n, seed: seeds[i] === "" ? null : (seeds[i] as number) })));
      } catch (e) {
        return { pairs: null, error: dupError ?? (e instanceof Error ? e.message : "These seeds cannot be arranged."), duplicates };
      }
    }
    const pairs: [string, string][] = [];
    for (let i = 0; i < 8; i++) pairs.push([ordered[i * 2], ordered[i * 2 + 1]]);
    return { pairs, error: null, duplicates };
  }, [names, seeds, arrange]);
  const previewPairs = preview.pairs;

  // The americano rotation, previewed from the same generator the seeder uses,
  // so what the organiser reads here is exactly the draw they get.
  const amPlayerCount = rrNames.filter((n) => n.trim()).length;

  /**
   * Names the club record cannot tell apart.
   *
   * `resolveMembers` folds two identical names into one member on purpose — a
   * draw that entered the same person twice should say so. But two DIFFERENT
   * people who share a first name get the same treatment silently, and the
   * second one's night is credited to the first. Deciding that quietly is the
   * problem; asking is cheap, and the fix is a surname.
   */
  const duplicateNames = useMemo(() => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const raw of format === "compass" ? names : rrNames) {
      const key = nameKeyOf(raw);
      if (!key) continue;
      if (seen.has(key)) {
        if (!clashes.includes(seen.get(key)!)) clashes.push(seen.get(key)!);
      } else {
        seen.set(key, raw.trim());
      }
    }
    return clashes;
  }, [names, rrNames, format]);
  // Courts the chosen format could never fill with this field — see ./courtLoad.
  const emptyCourtNote = surplusCourtNote(
    courtsUsedBy(format, amPlayerCount),
    courtIds,
    // The compass draw keeps its entrants in a different list; everything else
    // reads rrNames. Using the wrong one made the note describe a field of zero.
    format === "compass" ? names.filter((n) => n.trim()).length : amPlayerCount,
    // A winner court plays one match however many turn up, so "add more
    // players" is not a remedy there.
    format !== "winner-court"
  );
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
    // One rule per format, from the registry — the same sentence the API would
    // return, so the organiser never sees two different explanations.
    if (format === "compass" && trimmed.some((n) => !n)) {
      setError(`All 16 ${entrantsLabel.toLowerCase()} must be filled in.`);
      return;
    }
    const invalidField = validateField(format, trimmed.filter(Boolean).length);
    if (invalidField) {
      setError(invalidField);
      return;
    }
    // Raised here rather than left to the API, which can only name the seed —
    // this one names it while the seed boxes are still on screen and marked.
    if (format === "compass" && preview.error) {
      setError(preview.error);
      return;
    }
    if (pin.trim().length < 4) {
      setError("The coach PIN must be at least 4 characters.");
      return;
    }
    if (orgPin.trim().length < 4) {
      setError("Enter the organiser PIN — at least 4 characters. On a brand-new app, whatever you type here becomes it.");
      return;
    }
    if (newOrgPin.trim() && newOrgPin.trim().length < 4) {
      setError("A new organiser PIN must be at least 4 characters.");
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
          raceWinBy,
          gamesPerSet,
          amRounds: amRounds || effectiveRounds,
          pin: pin.trim(),
          organiserPin: orgPin.trim(),
          newOrganiserPin: newOrgPin.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to start tournament");
      setOrgPinChanged(!!data.organiserPinChanged);
      setSuccess(true);
      setStatus("active");
    } catch (e) {
      // The seed may well have landed. A dropped reply on a venue wifi is
      // indistinguishable here from a genuine failure, and treating it as a
      // failure strands the organiser on a form whose only button now fails
      // for good — the draw exists, so re-seeding is refused as "Tournament
      // already started". Ask the server what actually happened before saying
      // anything.
      const live = await fetch("/api/state")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (live?.tournament?.status && live.tournament.status !== "setup") {
        setStatus(live.tournament.status);
        // The draw landed, so show the success screen rather than the
        // "already active" card — otherwise the one thing the organiser most
        // needs from this page, the PIN they are now locked to, is never said.
        // The reply was lost, so whether the rotation landed is unknown; the
        // honest answer is the one that sends them to check.
        setOrgPinChanged(false);
        setLostReplyNote(
          newOrgPin.trim()
            ? `The draw started, but the reply was lost, so we cannot tell whether the organiser PIN changed to ${newOrgPin.trim()}. Try the new one first; if it is refused, the old one still works.`
            : "The draw started, but the reply was lost on the way back. Everything below is live."
        );
        setSuccess(true);
        return;
      }
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
            <summary className="text-white/40 text-xs cursor-pointer text-center">Restart tournament (results are saved to Past events first)</summary>
            <div className="mt-3 flex gap-2">
              <input
                value={orgPin}
                onChange={(e) => setOrgPin(e.target.value)}
                placeholder="Organiser PIN"
                type="password"
                inputMode="numeric"
                className="flex-1 min-w-0 bg-court-panel2 border border-court-line rounded-lg px-3 py-2 text-sm outline-none"
              />
              {/* The most destructive control in the app, and the only write
                  handler on this page with no try/catch and no in-flight guard:
                  a dropped connection threw past `res.ok`, the rejection was
                  swallowed by React, and the button simply did nothing for the
                  rest of the session with no message at all. */}
              <button
                disabled={resetBusy}
                onClick={async () => {
                  setError(null);
                  setResetBusy(true);
                  try {
                    const res = await fetch("/api/reset", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ pin: orgPin.trim() }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      setError(data.error || "Failed to reset");
                      return;
                    }
                    setStatus("setup");
                    setNames(Array(16).fill(""));
                    setRrNames(Array(7).fill(""));
                    setSeeds(Array(16).fill(""));
                  } catch {
                    setError("No connection — nothing was erased. Try again in a moment.");
                  } finally {
                    setResetBusy(false);
                  }
                }}
                className="rounded-lg bg-live text-white text-xs font-bold px-4 py-2 shrink-0 disabled:opacity-50"
              >
                {resetBusy ? "Erasing…" : "Erase & restart"}
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
            {/* Said from what the SERVER reported, not from what the form hoped.
                This line used to claim the organiser PIN was unchanged in every
                case — including the one where this very request had just
                changed it, which is how a rotation could happen unnoticed and
                lock the organiser out of their own event. */}
            {lostReplyNote && <span className="block text-gold/80 text-xs mt-1">{lostReplyNote}</span>}
            {orgPinChanged ? (
              <span className="block text-gold/80 text-xs mt-1">
                Your organiser PIN is now <span className="font-mono font-bold">{newOrgPin.trim()}</span> — write it down. Do not share
                either PIN with coaches.
              </span>
            ) : (
              <span className="block text-white/40 text-xs mt-1">Your organiser PIN is unchanged — do not share it with coaches.</span>
            )}
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
      {/* A plain datalist rather than a custom dropdown: it suggests without
          constraining, so a genuinely new player is still just typed in, and it
          behaves like the keyboard people already know on a phone. */}
      <datalist id="known-players">
        {knownNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

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
        {/* Grouped into families rather than one flat list. Twelve formats with
            names like americano / mixed americano / mixicano are close to
            unpickable in a single column; the families say what kind of thing
            each one is before the reader has to parse the name. */}
        <div className="flex flex-col gap-5">
          {FORMAT_FAMILIES.map((family) => (
            <div key={family.key}>
              <div className="mb-2">
                <p className="font-display uppercase text-xs tracking-[0.25em] text-gold/80">{family.title}</p>
                <p className="text-white/35 text-xs mt-0.5">{family.blurb}</p>
              </div>
              <div className="grid gap-2">
                {formatsInFamily(family.key).map(({ id, spec }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      // The compass draw and everything else hold their entrants
                      // in different state, so switching used to make a filled
                      // list appear to vanish — and an organiser who had just
                      // typed sixteen names retyped them. Carry them across
                      // instead, padding or trimming the way loadRoster does.
                      if (format === "compass" && id !== "compass") {
                        const filled = names.map((n) => n.trim()).filter(Boolean);
                        if (filled.length && rrNames.every((n) => !n.trim())) setRrNames(filled);
                      } else if (format !== "compass" && id === "compass") {
                        const filled = rrNames.map((n) => n.trim()).filter(Boolean);
                        if (filled.length && names.every((n) => !n.trim())) {
                          setNames([...filled.slice(0, 16), ...Array(Math.max(0, 16 - filled.length)).fill("")]);
                        }
                      }
                      setFormat(id);
                      // "Order by past results" describes the list as it was
                      // when it was sorted, for the format it was sorted under.
                      // Left standing across a switch it reassured an organiser
                      // that a two-group field was sensibly ordered when strength
                      // order is the one order that stacks every strong player
                      // into Group A.
                      setOrderNote(null);
                      // Everything but the bracket draws is scored as a short
                      // race to a points total — that running total IS the
                      // tournament, so sets would make no sense.
                      //
                      // Applied only when moving from a NON-race setting. Doing
                      // it on every tap meant idly comparing two rotating
                      // formats silently threw away a race target the organiser
                      // had already chosen, putting it back to 16.
                      const wantsRace = id === "two-group" || !!spec.rotatingPartners;
                      if (wantsRace && !isPointsRace(tiebreakMode)) {
                        // Keep what they had, so coming back to a bracket draw
                        // does not leave them on a race they never picked and
                        // with their best-of quietly reset to one.
                        setSetPlayChoice({ tiebreakMode, bestOfSets, gamesPerSet });
                        setTiebreakMode("race-to-16");
                        setBestOfSets(1);
                        if (spec.rotatingPartners) setRaceTarget(16);
                      } else if (!wantsRace && isPointsRace(tiebreakMode) && setPlayChoice) {
                        setTiebreakMode(setPlayChoice.tiebreakMode);
                        setBestOfSets(setPlayChoice.bestOfSets);
                        setGamesPerSet(setPlayChoice.gamesPerSet);
                        setSetPlayChoice(null);
                      }
                      // The discipline is deliberately NOT touched here. Forcing
                      // it to "doubles" for a rotating format looked harmless —
                      // four people are on court either way — but the discipline
                      // control is hidden for those formats, so nothing put it
                      // back: tapping a rotating format to read its blurb and
                      // tapping back silently turned a singles draw into a
                      // doubles one, which stops every entrant being recorded as
                      // a club member. The scoreboard now works out that a side
                      // holds two people from the match itself instead.
                    }}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      format === id ? "border-gold bg-gold/10" : "border-court-line bg-court-panel"
                    }`}
                  >
                    <p className="font-display uppercase text-sm mb-1">{spec.title}</p>
                    <p className="text-white/50 text-xs leading-relaxed">{spec.blurb}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Saved lists sit above the entrant fields, because the moment they are
          wanted is the moment someone is looking at an empty list again. */}
      <section className="mb-4 rounded-xl border border-court-line bg-court-panel p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
          <h2 className="font-display uppercase text-sm text-white/80">Saved lists</h2>
          <p className="text-white/35 text-xs">Keep a group so you never type it twice</p>
        </div>

        {rosters.length > 0 ? (
          <div className="grid gap-1.5 mb-3">
            {rosters.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg bg-court-panel2 px-3 py-2">
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm text-white/85">{r.label}</span>
                  <span className="block text-white/35 text-[11px]">
                    {r.names.length} entrants
                    {r.format ? ` · last used for ${r.format.replace(/-/g, " ")}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => loadRoster(r)}
                  className="shrink-0 rounded-lg border border-gold/50 text-gold font-display uppercase text-xs px-3 py-1.5"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => deleteRoster(r)}
                  disabled={rosterBusy}
                  className="shrink-0 text-white/25 hover:text-live text-lg px-1 disabled:opacity-40"
                  aria-label={`Delete ${r.label}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-white/35 text-xs mb-3">
            Nothing saved yet. Type your entrants below, then give the list a name and save it — it will still be
            here after you reset the draw.
          </p>
        )}

        <div className="flex gap-2">
          <input
            value={rosterLabel}
            onChange={(e) => setRosterLabel(e.target.value)}
            placeholder="Name this list, e.g. Tuesday night"
            className="flex-1 min-w-0 bg-court-panel2 border border-court-line rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-gold/50"
          />
          <button
            type="button"
            onClick={saveRoster}
            disabled={rosterBusy}
            className="shrink-0 rounded-lg bg-gold text-court-bg font-display uppercase text-xs font-bold px-4 disabled:opacity-40"
          >
            {rosterBusy ? "…" : "Save current"}
          </button>
        </div>
        {rosterNote && <p className="text-white/50 text-xs mt-2">{rosterNote}</p>}
      </section>

      {format === "compass" ? (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-display uppercase text-lg text-white/80">{entrantsLabel}</h2>
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
              <div key={i} className="flex items-center gap-2 rounded-lg border border-court-line bg-court-panel px-2 py-1.5 min-w-0">
                <span className="w-6 shrink-0 text-xs text-white/30 font-mono text-center">{i + 1}</span>
                <input
                  value={names[i]}
                  onChange={(e) => updateName(i, e.target.value)}
                  // Only where a row is one person. A doubles draw enters pairs,
                  // and suggesting "Ana" for a team called "Ana/Ben" is noise.
                  list={entrantsArePeople(format, discipline) ? "known-players" : undefined}
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={`${entrantLabel} ${i + 1}${discipline === "doubles" ? " (e.g. Alpha/Bravo)" : ""}`}
                  className="flex-1 min-w-0 bg-court-panel2 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-gold/50"
                />
                <input
                  value={seeds[i] === "" ? "" : String(seeds[i])}
                  onChange={(e) => updateSeed(i, e.target.value)}
                  placeholder="seed"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={!arrange}
                  // Only while the seeds are actually being used. With "Arrange
                  // by seed" off they decide nothing, and marking them left two
                  // boxes reading as errors with no message anywhere to explain
                  // them and a Start button that works perfectly well.
                  aria-invalid={arrange && seeds[i] !== "" && preview.duplicates.has(seeds[i] as number)}
                  className={`w-16 shrink-0 bg-court-panel2 rounded-md px-2 py-2 text-sm text-center outline-none focus:ring-2 ring-gold/50 disabled:opacity-30 ${
                    arrange && seeds[i] !== "" && preview.duplicates.has(seeds[i] as number) ? "ring-2 ring-live text-live" : ""
                  }`}
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
          {duplicateNames.length > 0 && (
            <p className="text-gold/80 text-xs mt-2">
              {duplicateNames.join(", ")} {duplicateNames.length === 1 ? "is" : "are"} entered twice. If that is the same person playing two
              slots, carry on. If they are two different people, give one a surname — the club record matches on the name, so otherwise
              one of them loses the night.
            </p>
          )}
        </section>
      ) : (
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-display uppercase text-lg text-white/80">{entrantsLabel}</h2>
            <div className="flex items-center gap-4">
              {/* Only where the entry order is read as a ranking. The two-group
                  formats read it as membership, and sorting those by strength
                  would quietly stack every strong player into one half. */}
              {canOrderByStrength && (
                <button onClick={orderEntrantsByStrength} type="button" className="text-xs text-gold underline underline-offset-4">
                  Order by past results
                </button>
              )}
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
          </div>

          {orderNote && <p className="text-white/45 text-xs mb-3">{orderNote}</p>}

          <div className="grid gap-1.5">
            {rrNames.map((n, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-court-line bg-court-panel px-2 py-1.5 min-w-0">
                <span className="w-6 shrink-0 text-xs text-white/30 font-mono text-center">{i + 1}</span>
                <input
                  value={n}
                  onChange={(e) => updateRrName(i, e.target.value)}
                  list={entrantsArePeople(format, discipline) ? "known-players" : undefined}
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={`${entrantLabel} ${i + 1}${!americano && discipline === "doubles" ? " (e.g. Alpha/Bravo)" : ""}`}
                  className="flex-1 min-w-0 bg-court-panel2 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 ring-gold/50"
                />
                {rrNames.length > (americano ? MIN_AMERICANO_PLAYERS : 3) && (
                  <button
                    type="button"
                    onClick={() => setRrNames((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label={`Remove ${entrantLabel.toLowerCase()} ${i + 1}`}
                    className="shrink-0 text-white/40 hover:text-live text-lg leading-none px-3 py-3 -my-1.5"
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
            className="mt-2 inline-block text-xs text-white/60 underline underline-offset-4 hover:text-white/80 py-2.5 px-1 -mx-1"
          >
            + Add {entrantLabel.toLowerCase()}
          </button>
          {/* One sentence from the registry, for every format alike: the reason
              this field is illegal, or what it will produce. The submit button
              reads the same rule, so the two can never say different things.

              The two-group and round-robin branches used to write their own
              sentence, and both described a field nobody had entered: two-group
              clamped the count up to its minimum before doing the arithmetic,
              so four teams were confidently promised the nine matches of six,
              in the ordinary grey, and the refusal only arrived on Start. */}
          <p className={`text-xs mt-3 ${describeField(format, amPlayerCount).ok ? "text-white/40" : "text-live"}`}>
            {describeField(format, amPlayerCount).message}
          </p>
          {duplicateNames.length > 0 && (
            <p className="text-gold/80 text-xs mt-2">
              {duplicateNames.join(", ")} {duplicateNames.length === 1 ? "is" : "are"} entered twice. If that is the same person playing two
              slots, carry on. If they are two different people, give one a surname — the club record matches on the name, so otherwise
              one of them loses the night.
            </p>
          )}
          {strengthStacked && (
            <p className="text-gold/80 text-xs mt-2">
              This list is in strength order, and this format takes the first half as one side and the rest as the other — so every strong
              player would land together. Shuffle the halves before starting.
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
                    ? ` With halves of ${mixedTeamHalfSize(amPlayerCount)} there are ${maxRoundsFor(format, amPlayerCount)} rounds before anyone repeats a partner.`
                    : ""
                }`
              : mixedAmericano
              ? `How many times everyone changes partners.${
                  amPlayerCount >= MIN_AMERICANO_PLAYERS
                    ? ` With ${amPlayerCount} players you can play up to ${maxRoundsFor(format, amPlayerCount)} rounds before anyone has to repeat a partner.`
                    : ""
                }`
              : mixedMexicano
              ? "How many times the table is redrawn. Each round is made from the standings at that moment, with every pair still crossing the two groups."
              : winnerCourt
              ? `How many matches are played in total. Only one match is on at a time, so this is the length of the whole session.${
                  isValidWinnerCourtField(amPlayerCount)
                    ? ` The queue moves two at a time, so it takes ${roundsForEveryone(amPlayerCount)} matches before everyone has had a turn.`
                    : ""
                }`
              : mixicano
              ? `How many times you change partner across the groups.${
                  isValidMixicanoField(amPlayerCount)
                    ? ` With groups of ${groupSize(amPlayerCount)} there are ${maxRoundsFor(format, amPlayerCount)} rounds before anyone repeats a partner.`
                    : ""
                }`
              : teamAmericano
              ? `How many times you change partner within your team.${
                  isValidTeamField(amPlayerCount)
                    ? ` A team of ${teamSize(amPlayerCount)} has ${maxRoundsFor(format, amPlayerCount)} rounds before anyone repeats a team-mate.`
                    : ""
                }`
              : kingCourt
              ? "How many rounds are played. After each one the winners on every court move up a rung and the losers move down, so where you finish is where you climbed to."
              : mexicano
              ? "How many times the table is redrawn. Each round is made from the standings at that moment, so partners and opponents follow your results."
              : `How many times everyone changes partners.${
                  MIN_AMERICANO_PLAYERS <= amPlayerCount
                    ? ` With ${amPlayerCount} players you can play up to ${maxRoundsFor(format, amPlayerCount)} rounds before anyone has to repeat a partner.`
                    : ""
                }`}
          </p>
          <NumberChoice
            label="number of rounds"
            value={effectiveRounds}
            onChange={setAmRounds}
            presets={ROUNDS_PRESETS}
            min={1}
            max={MAX_AMERICANO_ROUNDS}
          />
          {/* The one format where the round count decides who plays AT ALL.
              Everywhere else a short night means fewer matches each; here it
              means the back of the queue goes home without a game. */}
          {winnerCourt && isValidWinnerCourtField(amPlayerCount) && neverPlaying(amPlayerCount, effectiveRounds) > 0 && (
            <p className="text-live text-xs mt-2">
              {effectiveRounds} match{effectiveRounds === 1 ? "" : "es"} would leave {neverPlaying(amPlayerCount, effectiveRounds)} of the{" "}
              {amPlayerCount} never on court. {roundsForEveryone(amPlayerCount)} gives everyone a turn.
            </p>
          )}

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
                  <p className="text-[11px] text-white/45">Sitting out round 1: {mxPreview.sitting.join(", ")}</p>
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
                        <p className="text-[11px] text-white/45 mt-0.5">Sitting out: {sitting.map(nameOf).join(", ")}</p>
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

      {format === "compass" && (previewPairs || preview.error) && (
        <section className="mb-6">
          <h2 className="font-display uppercase text-sm text-white/50 mb-2">East Round of 16 preview</h2>
          {preview.error ? (
            <p className="text-live text-xs rounded-lg border border-live/40 bg-court-panel px-3 py-2.5">{preview.error}</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-1.5">
              {previewPairs!.map((p, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-court-line bg-court-panel px-3 py-2 text-sm">
                  <span className="text-white/30 font-mono text-xs w-6">M{i + 1}</span>
                  <span className="truncate">{p[0]}</span>
                  <span className="text-white/30 text-xs">vs</span>
                  <span className="truncate">{p[1]}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="mb-6">
        <h2 className="font-display uppercase text-lg text-white/80 mb-1">Match format</h2>
        <p className="text-white/40 text-xs mb-3">
          {americano
            ? "Picking a rotating format sets a short points race, because that is how these are normally played — but sets and games work just as well. Choose one below and the best-of options appear."
            : "How each individual match is scored."}
        </p>
        {!isPointsRace(tiebreakMode) && (
          <div className="mb-4 space-y-4">
            <div>
              <p className="font-display uppercase text-sm text-white/80 mb-2">How many sets</p>
              {/* Chips only, deliberately. Best-of has to be ODD or a match can
                  finish level, so these five ARE every legal value up to nine —
                  a Custom box here could only offer numbers the API then
                  refuses at the moment of Start. */}
              <div className="flex flex-wrap items-center gap-2">
                {BEST_OF_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBestOfSets(n)}
                    className={`rounded-xl px-4 py-2.5 font-display text-sm border ${
                      bestOfSets === n ? "bg-gold text-court-bg border-gold font-bold" : "border-court-line text-white/60"
                    }`}
                  >
                    Best of {n}
                  </button>
                ))}
              </div>
              {tiebreakMode === "match-tiebreak" && bestOfSets < 3 && (
                <p className="text-live text-xs mt-2">
                  A fast deciding set needs at least three sets — there is no decider in a best of {bestOfSets}. Every screen would say
                  &ldquo;match tiebreak&rdquo; while an ordinary set was played. Pick Best of 3, or choose the standard tiebreak.
                </p>
              )}
            </div>

            <div>
              <p className="font-display uppercase text-sm text-white/80 mb-2">Games in a set</p>
              <p className="text-white/40 text-xs mb-2">
                Six is a normal set. Four is the short set a club evening usually has room for, and eight or nine is a pro set played as
                one long set. Whatever you pick, two clear games take it and a tiebreak decides {gamesPerSet}-{gamesPerSet}.
              </p>
              <NumberChoice
                label="games in a set"
                value={gamesPerSet}
                onChange={setGamesPerSet}
                presets={GAMES_PER_SET_PRESETS}
                min={2}
                max={9}
              />
              <p className="text-white/40 text-xs mt-2">
                {matchFormatLabel(bestOfSets, { tiebreakMode, gamesPerSet })} — a typical score would be{" "}
                {gamesPerSet}-{Math.max(0, gamesPerSet - 2)}
                {bestOfSets > 1 ? `, ${gamesPerSet}-${Math.max(0, gamesPerSet - 4)}` : ""}.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-2">
          {tiebreakOptions(raceTarget, raceWinBy, gamesPerSet).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setTiebreakMode(opt.value);
                if (isPointsRace(opt.value)) setBestOfSets(1);
                // A "fast deciding set" replaces the DECIDER, and a best of one
                // has none: the engine quietly played an ordinary set while
                // every screen announced a match tiebreak. Three is the
                // shortest match the mode means anything in.
                if (opt.value === "match-tiebreak" && bestOfSets < 3) setBestOfSets(3);
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
              <NumberChoice
                label="race target"
                value={raceTarget}
                onChange={setRaceTarget}
                presets={RACE_TARGET_PRESETS}
                min={4}
                max={99}
              />
              <p className="text-white/40 text-xs mt-2">
                {tiebreakMode === "race-to-16"
                  ? raceWinBy === 2
                    ? `First side to ${raceTarget} AND two clear takes the match.`
                    : `First side to ${raceTarget} points takes the match.`
                  : `Play stops at ${2 * raceTarget - 2} total points; whoever has more wins (a typical winning score is ${raceTarget}).`}
              </p>
            </div>

            {tiebreakMode === "race-to-16" && (
              <div className="mt-4 pt-4 border-t border-court-line">
                <p className="font-display uppercase text-sm text-white/80 mb-2">Finishing the race</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {([
                    {
                      value: 1 as const,
                      title: "Sudden death",
                      desc: `Reaching ${raceTarget} wins it. At ${raceTarget - 1}-${raceTarget - 1} the next point decides the match.`,
                    },
                    {
                      value: 2 as const,
                      title: "Win by two (deuce)",
                      desc: `Like a tiebreak: it runs on past ${raceTarget} until someone leads by two. No cap.`,
                    },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRaceWinBy(opt.value)}
                      className={`text-left rounded-xl border p-3 transition-colors ${
                        raceWinBy === opt.value ? "border-gold bg-gold/10" : "border-court-line bg-court-panel2"
                      }`}
                    >
                      <p className="font-display uppercase text-sm mb-1">{opt.title}</p>
                      <p className="text-white/45 text-xs leading-relaxed">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-court-line">
              <p className="font-display uppercase text-sm text-white/80 mb-2">Serve changes every</p>
              <NumberChoice
                label="serve change"
                value={serveEvery}
                onChange={setServeEvery}
                presets={SERVE_EVERY_PRESETS}
                min={1}
                max={10}
                chipLabel={(n) => `${n} pts`}
              />
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
        {/* "Fill these automatically" is only true up to a point. A rotating
            format plays one round at a time and a round is floor(players / 4)
            matches, so ticking more courts than that leaves the spare ones
            unused all evening rather than merely quiet between matches. Said
            here, while it is still one tap to fix. */}
        {emptyCourtNote && (
          <p className="text-xs mt-2 text-gold/80">{emptyCourtNote}</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="font-display uppercase text-lg text-white/80 mb-1">PINs</h2>
        <p className="text-white/40 text-xs mb-3">
          Two different jobs, so they are two different PINs. Every coach needs the first one; only you need the second.
        </p>

        <label className="block mb-4">
          <span className="font-display uppercase text-sm text-white/70">Coach PIN</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="e.g. 1234"
            inputMode="numeric"
            className="mt-1 w-full bg-court-panel2 border border-court-line rounded-lg px-3 py-3 text-sm outline-none focus:ring-2 ring-gold/50"
          />
          <span className="block text-white/40 text-xs mt-1.5">
            Coaches enter this once to unlock the scorer and TV control, and it is required to submit results.
            Spectators who open the URL from the TV just hit a lock screen.
          </span>
        </label>

        <label className="block">
          <span className="font-display uppercase text-sm text-white/70">Organiser PIN</span>
          {/* Masked, like the identical field on the restart panel. The setup
              form is filled in at the desk with players around it, and this is
              the PIN that wipes events. */}
          <input
            value={orgPin}
            onChange={(e) => setOrgPin(e.target.value)}
            placeholder="only you know this one"
            type="password"
            inputMode="numeric"
            className="mt-1 w-full bg-court-panel2 border border-gold/30 rounded-lg px-3 py-3 text-sm outline-none focus:ring-2 ring-gold/50"
          />
          <span className="block text-white/40 text-xs mt-1.5">
            Starts and wipes events, and saves entrant lists. Keep it to yourself — a coach with the PIN above can
            score, but cannot erase the draw. On a brand-new app, whatever you type here becomes the organiser PIN.
          </span>
        </label>

        {/* Closing this section must forget what was typed in it. A <details>
            only HIDES its input: an organiser who opened it, typed a new PIN,
            thought better of it and collapsed the section again still had that
            value in state, still sent it on submit, and had their organiser PIN
            rotated to something they had decided against — with no trace of it
            anywhere on the page, and a success screen that then told them the
            PIN was unchanged. So the open state is React's, and closing clears
            the field. */}
        <details
          className="mt-3"
          open={changingOrgPin}
          onToggle={(e) => {
            const open = (e.currentTarget as HTMLDetailsElement).open;
            setChangingOrgPin(open);
            if (!open) setNewOrgPin("");
          }}
        >
          <summary className="text-white/35 text-xs cursor-pointer">Change the organiser PIN</summary>
          <input
            value={newOrgPin}
            onChange={(e) => setNewOrgPin(e.target.value)}
            placeholder="new organiser PIN"
            inputMode="numeric"
            className="mt-2 w-full bg-court-panel2 border border-court-line rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 ring-gold/50"
          />
          <span className="block text-white/35 text-xs mt-1.5">
            Enter the current one above and the new one here; it changes when the draw starts. If it is ever
            forgotten, set ORGANISER_PIN on the host to get back in.
          </span>
          {newOrgPin.trim().length > 0 && (
            <span className="block text-gold/80 text-xs mt-1.5">
              On Start, the organiser PIN becomes <span className="font-mono font-bold">{newOrgPin.trim()}</span>. Close this section to
              leave it as it is.
            </span>
          )}
        </details>
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
