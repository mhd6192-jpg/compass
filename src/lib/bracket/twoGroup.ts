import type { BracketCode } from "../types";

export interface TwoGroupNode {
  key: string;
  bracket: BracketCode;
  round: number;
  posIndex: number;
  isBracketFinal: boolean;
  initialPlayerSeeds?: [number, number];
  feedWinnerKey?: string;
  feedWinnerSlot?: 1 | 2;
  feedLoserKey?: undefined;
  feedLoserSlot?: undefined;
}

/** Fewer than this and the group stage eliminates nobody — both teams in a
 * group of two would qualify, so the groups would be pure decoration. */
export const MIN_TWO_GROUP_TEAMS = 6;

/**
 * Splits the entry list into two groups, alternating down the list. Entry order
 * is the organiser's seeding, so alternating keeps the two strongest entries
 * apart — they can only meet in the semis or the final.
 */
export function splitGroups(teamCount: number): [number[], number[]] {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < teamCount; i++) (i % 2 === 0 ? a : b).push(i);
  return [a, b];
}

/** Round-robin fixtures within one group, as node definitions. */
function groupFixtures(bracket: BracketCode, members: number[]): TwoGroupNode[] {
  const nodes: TwoGroupNode[] = [];
  let idx = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      nodes.push({
        key: `${bracket}-${idx}`,
        bracket,
        round: 1,
        posIndex: idx,
        isBracketFinal: false,
        initialPlayerSeeds: [members[i], members[j]],
      });
      idx++;
    }
  }
  return nodes;
}

/**
 * Two round-robin groups feeding a knockout: the top two of each group reach
 * the semifinals (crossed over, A1 v B2 and B1 v A2), and the winners meet in
 * the final.
 *
 * The semifinals are created empty. Nobody knows who qualifies until both
 * groups have finished, so their players are filled in later by
 * `ensureSemifinals` — only the semi-to-final wiring can be fixed up front.
 */
export function generateTwoGroup(teamCount: number): TwoGroupNode[] {
  if (teamCount < MIN_TWO_GROUP_TEAMS) {
    throw new Error(`Two groups needs at least ${MIN_TWO_GROUP_TEAMS} teams, got ${teamCount}`);
  }
  const [a, b] = splitGroups(teamCount);
  return [
    ...groupFixtures("GA", a),
    ...groupFixtures("GB", b),
    { key: "SF-0", bracket: "SF", round: 1, posIndex: 0, isBracketFinal: false, feedWinnerKey: "F-0", feedWinnerSlot: 1 },
    { key: "SF-1", bracket: "SF", round: 1, posIndex: 1, isBracketFinal: false, feedWinnerKey: "F-0", feedWinnerSlot: 2 },
    { key: "F-0", bracket: "F", round: 1, posIndex: 0, isBracketFinal: true },
  ];
}

/** How many matches an N-team two-group draw produces, for the setup preview. */
export function twoGroupMatchCount(teamCount: number): number {
  const [a, b] = splitGroups(teamCount);
  const rr = (n: number) => (n * (n - 1)) / 2;
  return rr(a.length) + rr(b.length) + 3;
}
