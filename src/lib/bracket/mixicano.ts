/**
 * Mixicano: every pair is one player from each group.
 *
 * The field is entered as two groups of equal size — in a mixed session that is
 * everyone from one side of the draw and then the other — and a pair is always
 * one from each. Every round you get a new partner from the opposite group, so
 * over a full run you play once with everybody there rather than once with half
 * of them. Scoring is individual, exactly as in a plain americano.
 *
 * The difference from the team americano is worth stating, because the two look
 * alike from the outside: there, your partner always comes from YOUR side and
 * the points belong to that side. Here your partner always comes from the OTHER
 * group and the points are your own. One format is about belonging to a team,
 * the other about mixing across a division that is not a team at all.
 *
 * The partner rotation is a Latin square — group A's first player partners
 * group B's first, second, third and so on, with everyone stepping round
 * together — so over `groupSize` rounds every possible pairing happens exactly
 * once and none happens twice. The resulting mixed pairs are then matched
 * against each other by the same circle method the other formats use, so the
 * opponents vary too.
 */

import { circlePairs } from "./americano";

export const MIN_MIXICANO_PLAYERS = 4;
export const MAX_MIXICANO_PLAYERS = 32;

export interface MixicanoMatch {
  round: number; // 1-based
  posIndex: number;
  /** Indexes into the full player list. Each side is one player from each group. */
  team1: [number, number];
  team2: [number, number];
}

/** Two equal groups that between them divide into whole matches. */
export function isValidMixicanoField(playerCount: number): boolean {
  return playerCount >= MIN_MIXICANO_PLAYERS && playerCount <= MAX_MIXICANO_PLAYERS && playerCount % 4 === 0;
}

export function groupSize(playerCount: number): number {
  return playerCount / 2;
}

export function matchesPerRound(playerCount: number): number {
  return playerCount / 4;
}

/**
 * Rounds before someone has to repeat a partner.
 *
 * A group of G has G possible partners in the other group, so G rounds — one
 * more than the same-group rotations the americano and team americano get,
 * because pairing across a division has no "can't partner yourself" to lose.
 */
export function maxMixicanoRounds(playerCount: number): number {
  return groupSize(playerCount);
}

export function defaultMixicanoRounds(playerCount: number): number {
  return Math.max(1, Math.min(maxMixicanoRounds(playerCount), 8));
}

/** Which group a player is in, from their position in the entry list. */
export function groupOf(index: number, playerCount: number): 1 | 2 {
  return index < groupSize(playerCount) ? 1 : 2;
}

export const GROUP_NAMES = ["Group A", "Group B"] as const;

export function mixicanoGroupName(group: number): string {
  return GROUP_NAMES[group - 1] ?? `Group ${group}`;
}

/**
 * The whole schedule, drawn up front.
 *
 * Round r pairs group A's player i with group B's player (i + r - 1), stepping
 * the whole group round by one each time. That is a Latin square: over
 * `groupSize` rounds every cross-group pairing appears exactly once.
 */
export function generateMixicano(playerCount: number, rounds: number): MixicanoMatch[] {
  if (!isValidMixicanoField(playerCount)) {
    throw new Error(
      `A mixicano needs two equal groups that divide into whole matches — a multiple of four players, at least ${MIN_MIXICANO_PLAYERS} (got ${playerCount})`
    );
  }

  const size = groupSize(playerCount);
  const out: MixicanoMatch[] = [];

  for (let round = 1; round <= rounds; round++) {
    // The mixed pairs for this round: pair i is A[i] with B[(i + round - 1) % size].
    const pairs: [number, number][] = [];
    for (let i = 0; i < size; i++) {
      pairs.push([i, size + ((i + round - 1) % size)]);
    }

    // Then two pairs to a match. The circle method over the pair indexes keeps
    // the opponents moving as well; with only one match a round it degenerates
    // to the single possible pairing, which is correct.
    const meetings = circlePairs(size, round - 1);
    meetings.forEach(([x, y], posIndex) => {
      out.push({ round, posIndex, team1: pairs[x], team2: pairs[y] });
    });
  }

  return out;
}

/** How varied the schedule turned out — shown to the organiser before they commit. */
export function mixicanoScheduleQuality(matches: MixicanoMatch[], playerCount: number) {
  const partnerCount = new Map<string, number>();
  const played = new Array(playerCount).fill(0);
  for (const m of matches) {
    for (const t of [m.team1, m.team2]) {
      partnerCount.set(`${t[0]}-${t[1]}`, (partnerCount.get(`${t[0]}-${t[1]}`) ?? 0) + 1);
    }
    for (const p of [...m.team1, ...m.team2]) played[p] += 1;
  }
  let repeatedPartnerships = 0;
  for (const c of partnerCount.values()) if (c > 1) repeatedPartnerships += c - 1;
  return {
    repeatedPartnerships,
    minMatches: Math.min(...played),
    maxMatches: Math.max(...played),
    groupSize: groupSize(playerCount),
  };
}
