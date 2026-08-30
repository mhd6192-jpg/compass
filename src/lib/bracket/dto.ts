import type { Match, Player, PrismaClient } from "@prisma/client";
import { computeMatchState, ScoringConfig, toDTO } from "../scoring/engine";
import { getScoringConfig } from "./config";
import { getTvControl } from "../tvControl";
import { BracketCode, MatchDTO, MatchStatus, PlayerDTO, ROUND_NAMES, isPointsRace, pairLabel } from "../types";
import { biggestDeficitRecovered } from "../scoring/comeback";
import { longestPointGap } from "../scoring/rally";

type MatchWithRelations = Match & {
  player1: Player | null;
  player2: Player | null;
  // Americano only; absent (undefined) for callers that don't include them.
  player1Partner?: Player | null;
  player2Partner?: Player | null;
  // Every caller loads whole point rows (no `select`), so the timestamps are
  // already here — they were simply not in the type.
  points: { slot: number; createdAt: Date; tappedAt: Date | null }[];
};

export function toPlayerDTO(p: Player | null): PlayerDTO | null {
  if (!p) return null;
  return { id: p.id, name: p.name, seed: p.seed };
}

/** The relations every DTO build needs — kept in one place so a new one can't be forgotten. */
export const MATCH_INCLUDE = {
  player1: true,
  player2: true,
  player1Partner: true,
  player2Partner: true,
  points: { orderBy: { seq: "asc" } },
} as const;

/**
 * One side of a match, ready to draw.
 *
 * With a partner (americano) the side is presented as the pairing, so screens
 * that only know how to render one name per side still show both people. The
 * members are carried alongside for anything that has to attribute a result to
 * the individuals rather than to the row.
 */
function toSide(
  primary: Player | null,
  partner: Player | null | undefined
): { side: PlayerDTO | null; members: PlayerDTO[] | null } {
  const first = toPlayerDTO(primary);
  const second = toPlayerDTO(partner ?? null);
  if (!first || !second) return { side: first, members: null };
  return {
    side: { id: first.id, name: pairLabel([first.name, second.name]), seed: first.seed },
    members: [first, second],
  };
}

export function buildMatchDTO(match: MatchWithRelations, config: ScoringConfig): MatchDTO {
  const slots = match.points.map((p) => p.slot as 1 | 2);
  const engineState = computeMatchState(slots, config);
  const stateDTO = toDTO(engineState, config);
  const bracket = match.bracket as BracketCode;

  // Only for the points races: across sets a running point tally misrepresents
  // who was actually in trouble. A result typed in as a final score has no
  // points recorded, so it simply has no comeback to report.
  const winnerSlot: 1 | 2 | null = match.winnerId
    ? match.winnerId === match.player1Id
      ? 1
      : 2
    : null;
  const comeback =
    winnerSlot && !match.forcedEnd && slots.length > 0 && isPointsRace(config.tiebreakMode)
      ? biggestDeficitRecovered(slots, winnerSlot)
      : null;

  const longestPointMs = longestPointGap(match.points);

  const side1 = toSide(match.player1, match.player1Partner);
  const side2 = toSide(match.player2, match.player2Partner);

  return {
    id: match.id,
    bracket,
    round: match.round,
    roundName: ROUND_NAMES[bracket]?.[match.round - 1] ?? `Round ${match.round}`,
    posIndex: match.posIndex,
    player1: side1.side,
    player2: side2.side,
    player1Members: side1.members,
    player2Members: side2.members,
    winnerId: match.winnerId,
    loserId: match.loserId,
    status: match.status as MatchStatus,
    courtId: match.courtId,
    courtSlot: match.courtSlot as "current" | "next" | null,
    isBracketFinal: match.isBracketFinal,
    isChampionshipFinal: bracket === "E" && match.isBracketFinal,
    forcedEnd: match.forcedEnd,
    forcedEndReason: match.forcedEndReason,
    startedAt: match.startedAt ? match.startedAt.toISOString() : null,
    completedAt: match.completedAt ? match.completedAt.toISOString() : null,
    state: stateDTO,
    comeback,
    longestPointMs,
  };
}

export async function getMatchDTO(prisma: PrismaClient, matchId: string): Promise<MatchDTO> {
  const config = await getScoringConfig(prisma);
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
    include: MATCH_INCLUDE,
  });
  return buildMatchDTO(match, config);
}

export async function getFullSnapshot(prisma: PrismaClient) {
  const configRow = await prisma.tournamentConfig.findUnique({ where: { id: "default" } });
  const config: ScoringConfig = {
    bestOfSets: configRow?.bestOfSets ?? 3,
    tiebreakMode: (configRow?.tiebreakMode as ScoringConfig["tiebreakMode"]) ?? "standard",
    raceTarget: configRow?.raceTarget || undefined,
    serveEvery: configRow?.serveEvery || undefined,
  };

  const matches = await prisma.match.findMany({
    include: MATCH_INCLUDE,
    orderBy: [{ bracket: "asc" }, { round: "asc" }, { posIndex: "asc" }],
  });
  const matchDTOs = matches.map((m) => buildMatchDTO(m, config));
  const courts = await prisma.court.findMany({ orderBy: { id: "asc" } });

  const total = matchDTOs.length;
  const completed = matchDTOs.filter((m) => m.status === "completed").length;

  return {
    tournament: {
      status: configRow?.status ?? "setup",
      format: configRow?.format ?? "compass",
      discipline: configRow?.discipline ?? "doubles",
      bestOfSets: config.bestOfSets,
      tiebreakMode: config.tiebreakMode,
      raceTarget: config.raceTarget ?? 0,
      serveEvery: config.serveEvery ?? 0,
      amRounds: configRow?.amRounds ?? 0,
    },
    courts,
    matches: matchDTOs,
    progress: { completed, total },
    tvControl: getTvControl(),
  };
}
