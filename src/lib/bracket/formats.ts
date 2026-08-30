/**
 * Every format, described once.
 *
 * Twelve formats had grown across seven files — the union type, the seeder, the
 * setup API, the setup form, the standings tables, the idle-screen stats — each
 * with its own chain of `format === "..."` tests. Adding a thirteenth meant
 * finding all seven, and forgetting one was silent: the format simply behaved
 * like whatever the fallthrough branch happened to be. That is not a
 * hypothetical. It produced the same default-rounds bug twice (a team of four
 * offered eight rounds of repeats) and, in one edit, quietly relabelled a
 * different format's stats card.
 *
 * So each format now declares itself here — what it is called, how to describe
 * it, what a legal field looks like, how many rounds it defaults to, and which
 * behaviours it shares with others — and everything else reads from this table.
 * The rules that genuinely differ per format (how a round is drawn) still live
 * in their own modules; only the DESCRIPTION of a format lives here.
 *
 * This module deliberately imports no application types. It sits underneath
 * `lib/types.ts`, which re-exports the union and the predicates from here, so
 * the registry can pull in each format's own helpers without a cycle.
 */

import { defaultRounds as americanoDefaultRounds, MAX_AMERICANO_PLAYERS, MIN_AMERICANO_PLAYERS } from "./americano";
import { MIN_MEXICANO_PLAYERS } from "./mexicano";
import { isValidKingCourtField, MIN_KING_COURT_PLAYERS } from "./kingCourt";
import { defaultTeamRounds, isValidTeamField, maxTeamRounds, MIN_TEAM_AMERICANO_PLAYERS } from "./teamAmericano";
import { defaultMixicanoRounds, isValidMixicanoField, maxMixicanoRounds, MIN_MIXICANO_PLAYERS } from "./mixicano";
import { defaultWinnerCourtRounds, isValidWinnerCourtField, MIN_WINNER_COURT_PLAYERS } from "./winnerCourt";
import {
  defaultMixedMexicanoRounds,
  isValidMixedMexicanoField,
  MIN_MIXED_MEXICANO_PLAYERS,
} from "./mixedMexicano";
import {
  defaultMixedTeamRounds,
  isValidMixedTeamField,
  maxMixedTeamRounds,
  MIN_MIXED_TEAM_PLAYERS,
} from "./mixedTeamAmericano";
import { MIN_TWO_GROUP_TEAMS } from "./twoGroup";

/** How the formats are grouped on the setup screen, in display order. */
export const FORMAT_FAMILIES = [
  { key: "bracket", title: "Draws and groups", blurb: "Fixed entrants — a pair or a person plays as one unit all day." },
  { key: "rotating", title: "Rotating partners", blurb: "Individuals. Your partner changes every round and you score for yourself." },
  { key: "mixed", title: "Two groups", blurb: "The field is entered in halves, and the format decides what the halves mean." },
  { key: "team", title: "Team events", blurb: "Two fixed sides. Your points go to your team, not to you." },
] as const;

export type FormatFamily = (typeof FORMAT_FAMILIES)[number]["key"];

export interface FormatSpec {
  title: string;
  /** The one-paragraph description on the setup screen. */
  blurb: string;
  family: FormatFamily;
  /** Entrants are individuals in a four-player match, with partners changing each round. */
  rotatingPartners?: boolean;
  /** Later rounds are built as the night goes rather than drawn up front. */
  derivedRounds?: boolean;
  /** The result belongs to a side rather than to a person. */
  teamScored?: boolean;
  /** Keeps a separate table per entry group rather than one list. */
  groupRanked?: boolean;
  /** The field is entered as two halves. */
  twoGroupEntry?: boolean;
  /**
   * Why a field is illegal, in words the organiser can act on — or null when it
   * is fine. One message, used by the form, the API and the seeder alike, so
   * they can never disagree about what is allowed.
   */
  validateField?: (playerCount: number) => string | null;
  /**
   * What this field will actually produce, in one line, for a field that is
   * legal — the counterpart to `validateField`. Kept here beside the rule it
   * complements so the form cannot describe a field one way and reject it in
   * another.
   */
  describeField?: (playerCount: number) => string;
  /** How many rounds to schedule when the organiser has not chosen. */
  defaultRounds?: (playerCount: number) => number;
  /** Rounds available before someone must repeat a partner, where that is bounded. */
  maxRounds?: (playerCount: number) => number;
  /** The line under the standings heading, saying how this format is ranked. */
  standingsSubtitle?: string;
  /** The eyebrow on the idle screen's "who is leading" card. */
  leaderEyebrow?: string;
}

const evenField = (min: number, what: string) => (n: number) =>
  n >= min && n % 2 === 0 ? null : `${what} needs an even number of players, at least ${min}, so the two groups come out equal (got ${n}).`;

const quarterField = (min: number, what: string, why: string) => (n: number) =>
  n >= min && n % 4 === 0 ? null : `${what} needs a multiple of four players, at least ${min} — ${why} (got ${n}).`;

export const FORMATS = {
  compass: {
    title: "Compass (16, single elim)",
    blurb: "Sixteen players, every loser drops into a consolation draw — nobody goes home after one match.",
    family: "bracket",
    validateField: (n) => (n === 16 ? null : `A compass draw needs exactly 16 entrants (got ${n}).`),
  },
  "round-robin": {
    title: "Round robin group",
    blurb: "One group, everyone plays everyone once. The table decides it, with a deciding final if the top two end level.",
    family: "bracket",
    validateField: (n) => (n >= 3 ? null : `A round robin needs at least 3 entrants (got ${n}).`),
  },
  "two-group": {
    title: "Two groups → semis → final",
    blurb: `Split into Group A and Group B, each a round robin. The top two of each group cross over into the semifinals (A1 v B2, B1 v A2), and the winners meet in the final. Needs at least ${MIN_TWO_GROUP_TEAMS} teams.`,
    family: "bracket",
    validateField: (n) => (n >= MIN_TWO_GROUP_TEAMS ? null : `Two groups need at least ${MIN_TWO_GROUP_TEAMS} teams (got ${n}).`),
    standingsSubtitle: "Top two of each group reach the semifinals",
  },

  americano: {
    title: "Americano (rotating partners)",
    blurb: `Enter individuals, not pairs. Every round everyone gets a new partner and a new pair of opponents, and each player keeps their own running points total — the winner is the highest scorer, not a team. Needs at least ${MIN_AMERICANO_PLAYERS} players.`,
    family: "rotating",
    rotatingPartners: true,
    validateField: (n) =>
      n >= MIN_AMERICANO_PLAYERS && n <= MAX_AMERICANO_PLAYERS
        ? null
        : `An americano needs between ${MIN_AMERICANO_PLAYERS} and ${MAX_AMERICANO_PLAYERS} players (got ${n}).`,
    describeField: (n) => `${n} players → ${Math.floor(n / 4)} match${Math.floor(n / 4) === 1 ? "" : "es"} per round${n % 4 !== 0 ? `, with ${n % 4} sitting out each round (taking turns)` : ""}.`,
    defaultRounds: americanoDefaultRounds,
    maxRounds: (n) => Math.max(1, n - 1),
    standingsSubtitle: "Ranked on points won — partners change every round",
    leaderEyebrow: "Leading the americano",
  },
  mexicano: {
    title: "Mexicano (partners by standing)",
    blurb: `Like the americano, but each round is drawn from the table rather than fixed in advance: the top four play each other, then the next four, and within each four the leader partners the fourth. Win and you move up into tougher company. Needs at least ${MIN_MEXICANO_PLAYERS} players.`,
    family: "rotating",
    rotatingPartners: true,
    derivedRounds: true,
    validateField: (n) => (n >= MIN_MEXICANO_PLAYERS ? null : `A mexicano needs at least ${MIN_MEXICANO_PLAYERS} players (got ${n}).`),
    describeField: (n) => `${n} players → ${Math.floor(n / 4)} match${Math.floor(n / 4) === 1 ? "" : "es"} per round${n % 4 !== 0 ? `, with ${n % 4} sitting out each round (taking turns)` : ""}.`,
    defaultRounds: americanoDefaultRounds,
    standingsSubtitle: "Ranked on points won — next round is drawn from this table",
    leaderEyebrow: "Leading the mexicano",
  },
  "king-court": {
    title: "King of the court (climb the ladder)",
    blurb: `Courts are ranked, and the king court is the top one. Each round every court plays its own match: the two winners move up a court, the two losers move down, and your partner is always someone arriving from the other direction. Needs a multiple of four players, at least ${MIN_KING_COURT_PLAYERS}.`,
    family: "rotating",
    rotatingPartners: true,
    derivedRounds: true,
    validateField: (n) =>
      isValidKingCourtField(n)
        ? null
        : `King of the court needs a multiple of four players, at least ${MIN_KING_COURT_PLAYERS} — every rung of the ladder has to be full (got ${n}).`,
    describeField: (n) => `${n} players → a ladder of ${n / 4} courts, everyone playing every round.`,
    defaultRounds: americanoDefaultRounds,
    standingsSubtitle: "Ranked on points won — winners climb a court each round",
    leaderEyebrow: "Most points so far",
  },
  "winner-court": {
    title: "Winner court (winners stay on)",
    blurb: `One court and a queue. The pair that wins keeps the court and its partnership; the pair that loses goes to the back of the line, and the next two waiting come on to challenge. Needs at least ${MIN_WINNER_COURT_PLAYERS} players — four on court and a pair waiting.`,
    family: "rotating",
    rotatingPartners: true,
    derivedRounds: true,
    validateField: (n) =>
      isValidWinnerCourtField(n)
        ? null
        : `A winner court needs at least ${MIN_WINNER_COURT_PLAYERS} players — four on court and a pair waiting to challenge (got ${n}).`,
    describeField: (n) => `${n} players → four on court, ${n - 4} waiting. One match at a time.`,
    defaultRounds: defaultWinnerCourtRounds,
    standingsSubtitle: "Ranked on points won — winners keep the court",
    leaderEyebrow: "Most points so far",
  },

  mixicano: {
    title: "Mixicano (pairs across two groups)",
    blurb:
      "Enter two equal groups — in a mixed session, everyone from one side of the draw and then the other. Every pair is one player from each group, you get a new partner from the other group each round, and scoring is individual. Needs a multiple of four players.",
    family: "mixed",
    rotatingPartners: true,
    twoGroupEntry: true,
    validateField: (n) =>
      isValidMixicanoField(n)
        ? null
        : `A mixicano needs a multiple of four players, at least ${MIN_MIXICANO_PLAYERS} — two equal groups that make whole matches (got ${n}).`,
    describeField: (n) => `${n} players → two groups of ${n / 2}, ${n / 4} match${n / 4 === 1 ? "" : "es"} per round. Every pair is one from each group.`,
    defaultRounds: defaultMixicanoRounds,
    maxRounds: maxMixicanoRounds,
    standingsSubtitle: "Ranked on points won — every pair is one from each group",
    leaderEyebrow: "Leading the mixicano",
  },
  "mixed-americano": {
    title: "Mixed americano (two groups, own winners)",
    blurb:
      "A plain americano rotation over the whole field — partners can come from either group — but the two groups are ranked separately, so each has its own winner. Enter one group and then the other. If you want every PAIR to be one from each group, pick the mixicano instead.",
    family: "mixed",
    rotatingPartners: true,
    twoGroupEntry: true,
    groupRanked: true,
    validateField: evenField(MIN_AMERICANO_PLAYERS, "A mixed americano"),
    describeField: (n) => `${n} players → two groups of ${n / 2}, ranked separately. Partners are drawn from the whole field.`,
    defaultRounds: americanoDefaultRounds,
    maxRounds: (n) => Math.max(1, n - 1),
    standingsSubtitle: "Partners come from anywhere — each group has its own winner",
    leaderEyebrow: "Top of the whole field",
  },
  "mixed-mexicano": {
    title: "Mixed mexicano (standings + two groups)",
    blurb:
      "Both at once: every pair is one player from each group, and each round is redrawn from the standings. Each group is ranked on its own, so the top two of each meet on the first court, the next two of each on the second, and winning moves you up into tougher company. Needs a multiple of four players.",
    family: "mixed",
    rotatingPartners: true,
    derivedRounds: true,
    twoGroupEntry: true,
    groupRanked: true,
    validateField: (n) =>
      isValidMixedMexicanoField(n)
        ? null
        : `A mixed mexicano needs a multiple of four players, at least ${MIN_MIXED_MEXICANO_PLAYERS} — two equal groups that make whole matches (got ${n}).`,
    describeField: (n) => `${n} players → two groups of ${n / 2}, ${n / 4} match${n / 4 === 1 ? "" : "es"} per round. Every pair is one from each group, and the courts follow the standings.`,
    defaultRounds: defaultMixedMexicanoRounds,
    standingsSubtitle: "Each group ranked on its own — the next round follows these tables",
    leaderEyebrow: "Leading the mixed mexicano",
  },

  "team-americano": {
    title: "Team americano (two sides)",
    blurb: `Two fixed teams, entered one after the other. Every round you partner someone else from your own team and play two from the other side, and every point you win goes to your team's total. Needs a multiple of four players, at least ${MIN_TEAM_AMERICANO_PLAYERS}.`,
    family: "team",
    rotatingPartners: true,
    teamScored: true,
    twoGroupEntry: true,
    validateField: (n) =>
      isValidTeamField(n)
        ? null
        : `A team americano needs a multiple of four players, at least ${MIN_TEAM_AMERICANO_PLAYERS} — two equal teams that each split into pairs (got ${n}).`,
    describeField: (n) => `${n} players → two teams of ${n / 2}, ${n / 4} match${n / 4 === 1 ? "" : "es"} per round. The first ${n / 2} names are Team A, the rest Team B.`,
    defaultRounds: defaultTeamRounds,
    maxRounds: maxTeamRounds,
    standingsSubtitle: "Every point you win goes to your team",
    leaderEyebrow: "Top scorer",
  },
  "mixed-team-americano": {
    title: "Mixed team americano (two sides, mixed pairs)",
    blurb: `The team americano with every pair mixed within its own side. Enter it in quarters: team A's first half, team A's second half, then team B's two halves. You always partner someone from the other half of YOUR team, play the other team, and every point goes to your team's total. Needs a multiple of four players, at least ${MIN_MIXED_TEAM_PLAYERS}.`,
    family: "team",
    rotatingPartners: true,
    teamScored: true,
    twoGroupEntry: true,
    validateField: (n) =>
      isValidMixedTeamField(n)
        ? null
        : `A mixed team americano needs a multiple of four players, at least ${MIN_MIXED_TEAM_PLAYERS} — two teams that each split into two halves (got ${n}).`,
    describeField: (n) => `${n} players → two teams of ${n / 2}, each split into halves of ${n / 4}. ${n / 4} match${n / 4 === 1 ? "" : "es"} per round.`,
    defaultRounds: defaultMixedTeamRounds,
    maxRounds: maxMixedTeamRounds,
    standingsSubtitle: "Every point you win goes to your team · pairs are mixed within it",
    leaderEyebrow: "Top scorer",
  },
} satisfies Record<string, FormatSpec>;

export type TournamentFormat = keyof typeof FORMATS;

export const FORMAT_IDS = Object.keys(FORMATS) as TournamentFormat[];

export function isTournamentFormat(value: unknown): value is TournamentFormat {
  return typeof value === "string" && value in FORMATS;
}

/** The spec for a format, falling back to the compass draw for anything unrecognised. */
export function formatSpec(format: string | undefined): FormatSpec {
  return (isTournamentFormat(format) ? FORMATS[format] : FORMATS.compass) as FormatSpec;
}

/** Formats in one family, in registry order. */
export function formatsInFamily(family: FormatFamily): Array<{ id: TournamentFormat; spec: FormatSpec }> {
  return FORMAT_IDS.filter((id) => (FORMATS[id] as FormatSpec).family === family).map((id) => ({
    id,
    spec: FORMATS[id] as FormatSpec,
  }));
}

/** Why this field is illegal for this format, or null. */
export function validateField(format: string | undefined, playerCount: number): string | null {
  return formatSpec(format).validateField?.(playerCount) ?? null;
}

/**
 * One line about this field: why it is illegal, or what it will produce.
 *
 * `ok` says which it is, so the caller can colour it without re-deriving the
 * answer — and so the form and the submit button can never disagree.
 */
export function describeField(format: string | undefined, playerCount: number): { ok: boolean; message: string } {
  const spec = formatSpec(format);
  const invalid = spec.validateField?.(playerCount);
  if (invalid) return { ok: false, message: invalid };
  return { ok: true, message: spec.describeField?.(playerCount) ?? "" };
}

/** How many rounds this format schedules when the organiser has not chosen. 0 = not a rounds-based format. */
export function defaultRoundsFor(format: string | undefined, playerCount: number): number {
  return formatSpec(format).defaultRounds?.(playerCount) ?? 0;
}
