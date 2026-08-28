import {
  BRACKET_ROUND1_MATCHES,
  BRACKET_TOTAL_ROUNDS,
  BracketCode,
  LOSER_TARGET,
} from "../types";

const ALL_BRACKETS: BracketCode[] = ["E", "W", "N", "S", "NE", "SE", "NW", "SW"];

export interface SkeletonNode {
  key: string; // unique within the skeleton, e.g. "E-1-0"
  bracket: BracketCode;
  round: number;
  posIndex: number;
  isBracketFinal: boolean;
  isChampionshipFinal: boolean;
  initialPlayerSeeds?: [number, number]; // 0-based seed index into the ordered player list (E round 1 only)
  feedWinnerKey?: string;
  feedWinnerSlot?: 1 | 2;
  feedLoserKey?: string;
  feedLoserSlot?: 1 | 2;
}

function key(bracket: BracketCode, round: number, posIndex: number) {
  return `${bracket}-${round}-${posIndex}`;
}

/**
 * Generates the full, fixed 32-match compass draw skeleton with deterministic
 * feed-forward wiring (winner -> next round same bracket; loser -> next
 * bracket's round 1, paired by fixed bracket position). Matches are created
 * up front with null players except East Round of 16; player slots fill in
 * as source matches complete.
 */
export function generateSkeleton(orderedPlayerIds: string[]): SkeletonNode[] {
  if (orderedPlayerIds.length !== 16) {
    throw new Error("Compass draw requires exactly 16 players");
  }

  const nodes: SkeletonNode[] = [];

  for (const bracket of ALL_BRACKETS) {
    const totalRounds = BRACKET_TOTAL_ROUNDS[bracket];
    const round1Matches = BRACKET_ROUND1_MATCHES[bracket];

    for (let round = 1; round <= totalRounds; round++) {
      const matchesInRound = round1Matches / Math.pow(2, round - 1);
      const isBracketFinal = round === totalRounds;

      for (let posIndex = 0; posIndex < matchesInRound; posIndex++) {
        const node: SkeletonNode = {
          key: key(bracket, round, posIndex),
          bracket,
          round,
          posIndex,
          isBracketFinal,
          isChampionshipFinal: bracket === "E" && isBracketFinal,
        };

        if (bracket === "E" && round === 1) {
          node.initialPlayerSeeds = [posIndex * 2, posIndex * 2 + 1];
        }

        if (!isBracketFinal) {
          node.feedWinnerKey = key(bracket, round + 1, Math.floor(posIndex / 2));
          node.feedWinnerSlot = ((posIndex % 2) + 1) as 1 | 2;
        }

        const loserTargetBracket = LOSER_TARGET[bracket]?.[round];
        if (loserTargetBracket) {
          node.feedLoserKey = key(loserTargetBracket, 1, Math.floor(posIndex / 2));
          node.feedLoserSlot = ((posIndex % 2) + 1) as 1 | 2;
        }

        nodes.push(node);
      }
    }
  }

  return nodes;
}

export const TOTAL_MATCHES = 32;
