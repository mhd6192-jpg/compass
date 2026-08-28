export type BracketCode = "E" | "W" | "N" | "S" | "NE" | "SE" | "NW" | "SW" | "RR";

export type MatchStatus =
  | "pending" // one or both players not yet known
  | "ready" // both players known, not yet on a court
  | "scheduled" // assigned to a court slot, no point scored yet
  | "in_progress" // at least one point scored
  | "completed";

export type TiebreakMode = "standard" | "match-tiebreak" | "advantage" | "race-to-9" | "race-to-16";

/** Formats with no games or sets — the whole match is one race of points. */
export const POINTS_RACE_MODES: TiebreakMode[] = ["race-to-9", "race-to-16"];

export function isPointsRace(mode: TiebreakMode | string | undefined): boolean {
  return POINTS_RACE_MODES.includes(mode as TiebreakMode);
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
};

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
}

export interface MatchStateDTO {
  // derived, event-sourced live score state
  config: { bestOfSets: number; tiebreakMode: TiebreakMode };
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
  player1: PlayerDTO | null;
  player2: PlayerDTO | null;
  winnerId: string | null;
  loserId: string | null;
  status: MatchStatus;
  courtId: number | null;
  courtSlot: "current" | "next" | null;
  isBracketFinal: boolean;
  isChampionshipFinal: boolean; // East Final only
  forcedEnd: boolean;
  forcedEndReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  state: MatchStateDTO;
}

export type AnimationTier = "point" | "game" | "set" | "match" | "champion";
