export interface RoundRobinNode {
  key: string;
  bracket: "RR";
  round: 1;
  posIndex: number;
  isBracketFinal: boolean;
  initialPlayerSeeds: [number, number];
  feedWinnerKey?: undefined;
  feedWinnerSlot?: undefined;
  feedLoserKey?: undefined;
  feedLoserSlot?: undefined;
}

/** Every team plays every other team exactly once. No elimination, no feed wiring. */
export function generateRoundRobin(teamCount: number): RoundRobinNode[] {
  const nodes: RoundRobinNode[] = [];
  let idx = 0;
  for (let i = 0; i < teamCount; i++) {
    for (let j = i + 1; j < teamCount; j++) {
      nodes.push({
        key: `RR-${idx}`,
        bracket: "RR",
        round: 1,
        posIndex: idx,
        isBracketFinal: false,
        initialPlayerSeeds: [i, j],
      });
      idx++;
    }
  }
  return nodes;
}
