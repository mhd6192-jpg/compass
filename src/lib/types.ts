// E..SW are the compass draw. RR is a single round-robin group. GA/GB/SF/F are
// the two-group format: two groups feeding semifinals and a final.
// AM is the americano rotation: no bracket at all, just numbered rounds.
export type BracketCode = "E" | "W" | "N" | "S" | "NE" | "SE" | "NW" | "SW" | "RR" | "GA" | "GB" | "SF" | "F" | "AM";

// The formats themselves are declared in lib/bracket/formats.ts — one entry
// each, holding everything that is merely a DESCRIPTION of a format. These
// predicates read from that table so a new format cannot be half-added: it
// either declares a behaviour or it does not have it.
export type { TournamentFormat } from "./bracket/formats";
import { formatSpec } from "./bracket/formats";

/**
 * The formats entered as individuals, where a match holds four people and the
 * pairings change every round. They differ in where the next round comes from —
 * an americano draws the lot in advance, a mexicano re-ranks the field on
 * points, king of the court moves people up and down a ladder, a winner court
 * queues challengers, and the two-group variants add a constraint on who may
 * partner whom. Everything downstream — scoring, court booking, the
 * four-people-per-match handling — treats them identically.
 */
export function isRotatingPartners(format: string | undefined): boolean {
  return !!formatSpec(format).rotatingPartners;
}

/** Formats whose rounds are built as the night goes, so they cannot be previewed in full. */
export function isDerivedRounds(format: string | undefined): boolean {
  return !!formatSpec(format).derivedRounds;
}

/** Formats whose result belongs to a side rather than to a person. */
export function isTeamScored(format: string | undefined): boolean {
  return !!formatSpec(format).teamScored;
}

/**
 * The formats that keep a separate table per group rather than one list.
 *
 * A mixed mexicano must, because those two tables are how the next round is
 * drawn. A mixed americano does it for a different reason: the rotation is a
 * plain americano over the whole field, and the per-group tables are the whole
 * point of running it at a mixed event — they are what give each group its own
 * winner.
 */
export function isGroupRanked(format: string | undefined): boolean {
  return !!formatSpec(format).groupRanked;
}

/** The formats whose field is entered as two halves. */
export function isTwoGroupEntry(format: string | undefined): boolean {
  return !!formatSpec(format).twoGroupEntry;
}

export function isAmericano(format: string | undefined): boolean {
  return format === "americano";
}

export function isMexicano(format: string | undefined): boolean {
  return format === "mexicano";
}

export function isKingCourt(format: string | undefined): boolean {
  return format === "king-court";
}

export function isMixicano(format: string | undefined): boolean {
  return format === "mixicano";
}

export function isWinnerCourt(format: string | undefined): boolean {
  return format === "winner-court";
}

export function isMixedMexicano(format: string | undefined): boolean {
  return format === "mixed-mexicano";
}

export function isMixedAmericano(format: string | undefined): boolean {
  return format === "mixed-americano";
}

export function isTeamAmericano(format: string | undefined): boolean {
  return format === "team-americano";
}

export function isMixedTeamAmericano(format: string | undefined): boolean {
  return format === "mixed-team-americano";
}

/** How a side's pairing is written wherever two names share a scoreboard row. */
export function pairLabel(names: string[]): string {
  return names.filter(Boolean).join(" & ");
}

/**
 * Everyone on court in this match.
 *
 * Four people in americano, two entrants everywhere else. Anything asking "is
 * this person already busy" or "who does this result belong to" has to go
 * through here — reading `player1Id`/`player2Id` alone silently ignores half
 * the court in an americano, which is how you double-book someone.
 */
export function participantIds(match: {
  player1?: { id: string } | null;
  player2?: { id: string } | null;
  player1Members?: { id: string }[] | null;
  player2Members?: { id: string }[] | null;
}): string[] {
  const sides = [
    match.player1Members ?? (match.player1 ? [match.player1] : []),
    match.player2Members ?? (match.player2 ? [match.player2] : []),
  ];
  return sides.flat().map((p) => p.id);
}

export type MatchStatus =
  | "pending" // one or both players not yet known
  | "ready" // both players known, not yet on a court
  | "scheduled" // assigned to a court slot, no point scored yet
  | "in_progress" // at least one point scored
  | "completed";

export type Discipline = "singles" | "doubles";

/** What one entrant is called, for screens that address the players directly. */
export function entrantWord(discipline: string | undefined, plural = false): string {
  const singles = discipline === "singles";
  if (plural) return singles ? "players" : "teams";
  return singles ? "player" : "team";
}

// The two race modes are parametric since v3: "race-to-16" is *first to N* and
// "race-to-9" is the *points total* rule, with N carried separately as
// `raceTarget`. The mode names are stored in the database, so they keep their
// historical spelling even though the numbers in them no longer mean anything.
export type TiebreakMode = "standard" | "match-tiebreak" | "advantage" | "race-to-9" | "race-to-16";

/** Formats with no games or sets — the whole match is one race of points. */
export const POINTS_RACE_MODES: TiebreakMode[] = ["race-to-9", "race-to-16"];

export function isPointsRace(mode: TiebreakMode | string | undefined): boolean {
  return POINTS_RACE_MODES.includes(mode as TiebreakMode);
}

/** The bits of a scoring config the race helpers need — both the server's
 * ScoringConfig and the serialized MatchStateDTO.config satisfy it. */
export interface RaceConfigLike {
  tiebreakMode: TiebreakMode | string;
  raceTarget?: number;
  serveEvery?: number;
  raceWinBy?: number;
}

/**
 * The points target of a race, e.g. 16 for "first to 16".
 *
 * 0 / undefined means "not configured", which is what every tournament seeded
 * before the target became configurable has — those keep their historical
 * numbers (9 for the points-total rule, 16 for first-to) so an old draw's
 * scores stay legal.
 */
export function raceTargetOf(config: RaceConfigLike): number {
  if (config.raceTarget && config.raceTarget >= 2) return Math.floor(config.raceTarget);
  return config.tiebreakMode === "race-to-9" ? 9 : 16;
}

/** Total points on the board when a points-total race runs out (barring the sudden-death decider). */
export function raceTotalPoints(config: RaceConfigLike): number {
  return 2 * raceTargetOf(config) - 2;
}

/**
 * The margin needed to take a race: 1 (the default) or 2.
 *
 * At 1 the point that reaches the target wins it outright, so target-1 all is
 * sudden death. At 2 the race behaves like a tiebreak — it carries on past the
 * target until someone leads by two — which is what people mean when they ask
 * for "deuce" on a race.
 */
export function raceWinByOf(config: RaceConfigLike): 1 | 2 {
  return config.raceWinBy === 2 ? 2 : 1;
}

/** How many points each side serves before it changes hands. 0/undefined = the house default of 4. */
export function serveEveryOf(config: RaceConfigLike): number {
  if (config.serveEvery && config.serveEvery >= 1) return Math.floor(config.serveEvery);
  return 4;
}

/**
 * What a standings tally is actually counting.
 *
 * The rotating formats are normally a points race, and everything says
 * "points". They can also be played as sets, and then the same column is
 * counting GAMES — so the word has to follow the scoring, or a table reading
 * "18 pts" after three 6-4 sets is quietly lying about what it shows.
 */
export function tallyUnit(tiebreakMode: string | undefined): { short: string; long: string } {
  // Unknown means "not told", not "set play". Callers that never pass a mode —
  // v2's screens, anything older — must keep saying points, which is both the
  // historical wording and right for the races those screens were built around.
  if (tiebreakMode === undefined) return { short: "pts", long: "points" };
  return isPointsRace(tiebreakMode) ? { short: "pts", long: "points" } : { short: "gms", long: "games" };
}

/** One line describing the match format, e.g. "First to 18 points" — every screen shows the same words. */
export function matchFormatLabel(bestOfSets: number, config: RaceConfigLike): string {
  if (config.tiebreakMode === "race-to-16") {
    const target = raceTargetOf(config);
    return raceWinByOf(config) === 2 ? `First to ${target}, win by 2` : `First to ${target} points`;
  }
  if (config.tiebreakMode === "race-to-9") return `${raceTotalPoints(config)} points total`;
  const base = `Best of ${bestOfSets}`;
  if (config.tiebreakMode === "match-tiebreak") return `${base} · match tiebreak`;
  if (config.tiebreakMode === "advantage") return `${base} · advantage sets`;
  return base;
}

export const BRACKET_LABELS: Record<BracketCode, string> = {
  E: "East",
  W: "West",
  N: "North",
  S: "South",
  NE: "Northeast",
  SE: "Southeast",
  NW: "Northwest",
  SW: "Southwest",
  RR: "Group",
  GA: "Group A",
  GB: "Group B",
  SF: "Semifinal",
  F: "Final",
  AM: "Americano",
};

export const BRACKET_TOTAL_ROUNDS: Record<BracketCode, number> = {
  E: 4,
  W: 3,
  N: 2,
  S: 2,
  NE: 1,
  SE: 1,
  NW: 1,
  SW: 1,
  RR: 1,
  GA: 1,
  GB: 1,
  SF: 1,
  F: 1,
  // Americano rounds are configured per tournament, not fixed by the format.
  AM: 1,
};

export const BRACKET_ROUND1_MATCHES: Record<BracketCode, number> = {
  E: 8,
  W: 4,
  N: 2,
  S: 2,
  NE: 1,
  SE: 1,
  NW: 1,
  SW: 1,
  RR: 0,
  GA: 0, // group size varies with the entry list
  GB: 0,
  SF: 2,
  F: 1,
  AM: 0,
};

export const ROUND_NAMES: Record<BracketCode, string[]> = {
  E: ["Round of 16", "Quarterfinal", "Semifinal", "Final"],
  W: ["Round 1", "Semifinal", "Final"],
  N: ["Round 1", "Final"],
  S: ["Round 1", "Final"],
  NE: ["Northeast Match"],
  SE: ["Southeast Match"],
  NW: ["Northwest Match"],
  SW: ["Southwest Match"],
  // Round 2 only exists when the group ends level at the top: one extra match
  // between the tied teams decides the title (see lib/bracket/decider.ts).
  RR: ["Group Stage", "Deciding Final"],
  GA: ["Group A"],
  GB: ["Group B"],
  SF: ["Semifinal"],
  F: ["Final"],
  // Named per round at render time ("Round 3 of 8"), so no fixed list here.
  AM: [],
};

/** The two group brackets of the two-group format, in display order. */
export const GROUP_BRACKETS: BracketCode[] = ["GA", "GB"];

// (sourceBracket, sourceRound) -> targetBracket for the LOSER drop-down.
// Only rounds that are not a bracket's own final have an entry here.
export const LOSER_TARGET: Partial<Record<BracketCode, Record<number, BracketCode>>> = {
  E: { 1: "W", 2: "N", 3: "NE" },
  W: { 1: "S", 2: "SE" },
  N: { 1: "NW" },
  S: { 1: "SW" },
};

export interface PlayerDTO {
  id: string;
  name: string;
  seed: number;
  /** Which of the two entry groups this player is in (1 or 2), for the formats that split the field. */
  team?: number;
  /** Mixed team americano only: the half within the team that pairs across (1 or 2). */
  pairGroup?: number;
}

export interface MatchStateDTO {
  // derived, event-sourced live score state
  config: { bestOfSets: number; tiebreakMode: TiebreakMode; raceTarget?: number; serveEvery?: number; raceWinBy?: number };
  setsWon: [number, number];
  completedSets: Array<{ games: [number, number]; tiebreak?: [number, number] }>;
  currentSet: { games: [number, number] } | null;
  currentGame: { points: [number, number]; display: [string, string]; isTiebreak: boolean } | null;
  isMatchTiebreakSet: boolean;
  matchWinnerSlot: 1 | 2 | null;
  totalPoints: number;
}

export interface MatchDTO {
  id: string;
  bracket: BracketCode;
  round: number;
  roundName: string;
  posIndex: number;
  /**
   * One side of the match, as something to put on a screen.
   *
   * In americano a side is two people, and `name` is then the pairing —
   * "Ana & Ben" — so that every screen in the app draws the side correctly
   * without knowing the format exists. `id` is still a real player's id, but
   * in americano it identifies only the FIRST member, never the side: anything
   * ranking or attributing results must read `player1Members` instead, which is
   * the honest list of who is on this side.
   */
  player1: PlayerDTO | null;
  player2: PlayerDTO | null;
  /** Americano only: the individuals making up each side. Null in every other format, where the side is one entrant. */
  player1Members: PlayerDTO[] | null;
  player2Members: PlayerDTO[] | null;
  winnerId: string | null;
  loserId: string | null;
  status: MatchStatus;
  courtId: number | null;
  courtSlot: "current" | "next" | null;
  isBracketFinal: boolean;
  isChampionshipFinal: boolean; // East Final only
  forcedEnd: boolean;
  forcedEndReason: string | null;
  /** When this match reached the front of a court and its four were called. */
  calledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  state: MatchStateDTO;
  /**
   * The worst deficit the winner recovered from, computed on the server where
   * the point history already sits. Sending the points themselves would put a
   * few hundred numbers on every 800ms poll for the sake of one idle-screen
   * card; this is two.
   */
  comeback: { deficit: number; from: [number, number] } | null;
  /**
   * Longest gap between two consecutive points, in milliseconds.
   *
   * Tap to tap, so it includes the time *after* the rally as well — see
   * `lib/scoring/rally.ts`. Named for what it measures rather than for the
   * rally it merely bounds.
   */
  longestPointMs: number | null;
}

export type AnimationTier = "point" | "game" | "set" | "match" | "champion";
