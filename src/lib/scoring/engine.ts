import { AnimationTier, MatchStateDTO, TiebreakMode, isPointsRace, raceTargetOf, raceTotalPoints } from "../types";

export interface ScoringConfig {
  bestOfSets: number; // e.g. 3 or 5 (always odd)
  tiebreakMode: TiebreakMode;
  /** Points target for the race formats, e.g. 16 or 18. 0/undefined = the historical default. */
  raceTarget?: number;
  /** Serve changes hands every N points in a race. 0/undefined = the house default of 4. */
  serveEvery?: number;
}

interface CompletedSet {
  games: [number, number];
  tiebreak?: [number, number];
}

export interface EngineState {
  sets: CompletedSet[];
  setsWon: [number, number];
  curSetGames: [number, number];
  curGamePoints: [number, number];
  isTiebreakGame: boolean;
  isMatchTiebreakSet: boolean;
  matchWinnerSlot: 1 | 2 | null;
  totalPoints: number;
}

export function setsToWin(bestOfSets: number) {
  return Math.ceil(bestOfSets / 2);
}

export function createInitialState(config?: ScoringConfig): EngineState {
  return {
    sets: [],
    setsWon: [0, 0],
    curSetGames: [0, 0],
    curGamePoints: [0, 0],
    isTiebreakGame: false,
    // The points-race formats play the whole match as a single race (no games or
    // sets), so they start straight in the match-tiebreak branch below.
    isMatchTiebreakSet: isPointsRace(config?.tiebreakMode),
    matchWinnerSlot: null,
    totalPoints: 0,
  };
}

const GAME_LABELS = ["0", "15", "30", "40"];

export function gameLabel(points: [number, number]): [string, string] {
  const [a, b] = points;
  if (a >= 3 && b >= 3) {
    if (a === b) return ["40", "40"];
    if (a > b) return ["Ad", "40"];
    return ["40", "Ad"];
  }
  return [GAME_LABELS[Math.min(a, 3)], GAME_LABELS[Math.min(b, 3)]];
}

function other(slot: 1 | 2): 1 | 2 {
  return slot === 1 ? 2 : 1;
}

/**
 * Applies a single point to the engine state and returns the new state plus
 * the "tier" of the change, used to decide how big an animation beat to fire.
 * Points scored after the match has already finished are ignored (tier "point", state unchanged).
 */
export function applyPoint(
  prev: EngineState,
  slot: 1 | 2,
  config: ScoringConfig
): { state: EngineState; tier: AnimationTier } {
  if (prev.matchWinnerSlot !== null) {
    return { state: prev, tier: "point" };
  }

  const s = clone(prev);
  s.totalPoints += 1;
  const i = slot - 1;
  const j = other(slot) - 1;
  const needed = setsToWin(config.bestOfSets);

  // --- deciding-set match tiebreak (first to 10, win by 2) ---
  if (s.isMatchTiebreakSet) {
    s.curGamePoints[i] += 1;
    const a = s.curGamePoints[i];
    const b = s.curGamePoints[j];
    // race-to-9 (points total, target T): every point is played out until the
    // combined total reaches 2T-2, then whoever has more wins (T=9: totals 16,
    // e.g. 9-7). A tie at that total doesn't end it — one further sudden-death
    // point decides it (9-8, total 17).
    // race-to-16 (first to T): no win-by-2 at all — T ends it, so (T-1)-(T-1)
    // is sudden death and the next point takes it.
    const target = raceTargetOf(config);
    const won =
      config.tiebreakMode === "race-to-16"
        ? a >= target
        : config.tiebreakMode === "race-to-9"
        ? a + b >= raceTotalPoints(config) && a !== b
        : a >= 10 && a - b >= 2;
    if (won) {
      // The winner is whoever HAS MORE POINTS — not whoever scored the last one.
      // Under the 16-points-total rule the deciding point is often scored by the
      // trailing side (e.g. 6-9 → they make it 7-9 and the match ends), so this
      // must be read off the scoreboard rather than assumed from the scorer.
      const p1Pts = s.curGamePoints[0];
      const p2Pts = s.curGamePoints[1];
      const winnerSlot: 1 | 2 = p1Pts > p2Pts ? 1 : 2;
      const wi = winnerSlot - 1;
      const tb: [number, number] = [p1Pts, p2Pts];
      const gamesForWinner: [number, number] = winnerSlot === 1 ? [1, 0] : [0, 1];
      s.sets.push({ games: gamesForWinner, tiebreak: tb });
      s.setsWon[wi] += 1;
      s.curSetGames = [0, 0];
      s.curGamePoints = [0, 0];
      s.isMatchTiebreakSet = false;
      if (s.setsWon[wi] >= needed) {
        s.matchWinnerSlot = winnerSlot;
        return { state: s, tier: "match" };
      }
      return { state: s, tier: "set" };
    }
    return { state: s, tier: "point" };
  }

  // --- tiebreak game at 6-6 within a normal set ---
  if (s.isTiebreakGame) {
    s.curGamePoints[i] += 1;
    const a = s.curGamePoints[i];
    const b = s.curGamePoints[j];
    if (a >= 7 && a - b >= 2) {
      const games: [number, number] = i === 0 ? [7, 6] : [6, 7];
      const tb: [number, number] = i === 0 ? [a, b] : [b, a];
      s.sets.push({ games, tiebreak: tb });
      s.setsWon[i] += 1;
      s.curSetGames = [0, 0];
      s.curGamePoints = [0, 0];
      s.isTiebreakGame = false;
      if (s.setsWon[i] >= needed) {
        s.matchWinnerSlot = slot;
        return { state: s, tier: "match" };
      }
      if (isDecidingSet(s, config, needed)) {
        s.isMatchTiebreakSet = true;
      }
      return { state: s, tier: "set" };
    }
    return { state: s, tier: "point" };
  }

  // --- normal game (0/15/30/40, deuce/advantage) ---
  s.curGamePoints[i] += 1;
  const a = s.curGamePoints[i];
  const b = s.curGamePoints[j];
  const wonGame = a >= 4 && a - b >= 2;
  if (!wonGame) {
    return { state: s, tier: "point" };
  }

  s.curSetGames[i] += 1;
  s.curGamePoints = [0, 0];
  const gw = s.curSetGames[i];
  const gl = s.curSetGames[j];

  const setWonOutright = gw >= 6 && gw - gl >= 2;
  if (setWonOutright) {
    const games: [number, number] = i === 0 ? [gw, gl] : [gl, gw];
    s.sets.push({ games });
    s.setsWon[i] += 1;
    s.curSetGames = [0, 0];
    if (s.setsWon[i] >= needed) {
      s.matchWinnerSlot = slot;
      return { state: s, tier: "match" };
    }
    if (isDecidingSet(s, config, needed)) {
      s.isMatchTiebreakSet = true;
    }
    return { state: s, tier: "set" };
  }

  if (config.tiebreakMode !== "advantage" && gw === 6 && gl === 6) {
    s.isTiebreakGame = true;
  }

  return { state: s, tier: "game" };
}

function isDecidingSet(s: EngineState, config: ScoringConfig, needed: number): boolean {
  if (config.tiebreakMode !== "match-tiebreak") return false;
  if (config.bestOfSets < 3) return false;
  return s.setsWon[0] === needed - 1 && s.setsWon[1] === needed - 1;
}

function clone(s: EngineState): EngineState {
  return {
    sets: s.sets.map((x) => ({ games: [...x.games] as [number, number], tiebreak: x.tiebreak ? ([...x.tiebreak] as [number, number]) : undefined })),
    setsWon: [...s.setsWon] as [number, number],
    curSetGames: [...s.curSetGames] as [number, number],
    curGamePoints: [...s.curGamePoints] as [number, number],
    isTiebreakGame: s.isTiebreakGame,
    isMatchTiebreakSet: s.isMatchTiebreakSet,
    matchWinnerSlot: s.matchWinnerSlot,
    totalPoints: s.totalPoints,
  };
}

export function computeMatchState(slots: Array<1 | 2>, config: ScoringConfig): EngineState {
  let state = createInitialState(config);
  for (const slot of slots) {
    state = applyPoint(state, slot, config).state;
  }
  return state;
}

/** Reconstructs an EngineState from a previously-serialized DTO, for client-side "what-if" prediction (e.g. will this tap end the match?). */
export function stateFromDTO(dto: MatchStateDTO): EngineState {
  return {
    sets: dto.completedSets.map((s) => ({ games: s.games, tiebreak: s.tiebreak })),
    setsWon: dto.setsWon,
    curSetGames: dto.currentSet?.games ?? [0, 0],
    curGamePoints: dto.currentGame?.points ?? [0, 0],
    isTiebreakGame: !!dto.currentGame?.isTiebreak && !dto.isMatchTiebreakSet,
    isMatchTiebreakSet: dto.isMatchTiebreakSet,
    matchWinnerSlot: dto.matchWinnerSlot,
    totalPoints: dto.totalPoints,
  };
}

export function toDTO(state: EngineState, config: ScoringConfig): MatchStateDTO {
  const currentGame = state.matchWinnerSlot
    ? null
    : state.isMatchTiebreakSet
    ? {
        points: state.curGamePoints,
        display: [String(state.curGamePoints[0]), String(state.curGamePoints[1])] as [string, string],
        isTiebreak: true,
      }
    : {
        points: state.curGamePoints,
        display: state.isTiebreakGame
          ? ([String(state.curGamePoints[0]), String(state.curGamePoints[1])] as [string, string])
          : gameLabel(state.curGamePoints),
        isTiebreak: state.isTiebreakGame,
      };

  return {
    config: {
      bestOfSets: config.bestOfSets,
      tiebreakMode: config.tiebreakMode,
      ...(config.raceTarget ? { raceTarget: config.raceTarget } : {}),
      ...(config.serveEvery ? { serveEvery: config.serveEvery } : {}),
    },
    setsWon: state.setsWon,
    completedSets: state.sets,
    currentSet: state.matchWinnerSlot ? null : { games: state.curSetGames },
    currentGame,
    isMatchTiebreakSet: state.isMatchTiebreakSet,
    matchWinnerSlot: state.matchWinnerSlot,
    totalPoints: state.totalPoints,
  };
}
