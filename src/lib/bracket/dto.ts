import type { Match, Player, PrismaClient } from "@prisma/client";
import { computeMatchState, ScoringConfig, toDTO } from "../scoring/engine";
import { getScoringConfig } from "./config";
import { getTvControl } from "../tvControl";
import { BracketCode, MatchDTO, MatchStatus, PlayerDTO, ROUND_NAMES, isPointsRace } from "../types";
import { biggestDeficitRecovered } from "../scoring/comeback";
import { longestPointGap } from "../scoring/rally";

type MatchWithRelations = Match & {
  player1: Player | null;
  player2: Player | null;
  // Every caller loads whole point rows (no `select`), so the timestamps are
  // already here — they were simply not in the type.
  points: { slot: number; createdAt: Date; tappedAt: Date | null }[];
};

export function toPlayerDTO(p: Player | null): PlayerDTO | null {
  if (!p) return null;
  return { id: p.id, name: p.name, seed: p.seed };
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

  return {
    id: match.id,
    bracket,
    round: match.round,
    roundName: ROUND_NAMES[bracket]?.[match.round - 1] ?? `Round ${match.round}`,
    posIndex: match.posIndex,
    player1: toPlayerDTO(match.player1),
    player2: toPlayerDTO(match.player2),
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
    include: { player1: true, player2: true, points: { orderBy: { seq: "asc" } } },
  });
  return buildMatchDTO(match, config);
}

export async function getFullSnapshot(prisma: PrismaClient) {
  const configRow = await prisma.tournamentConfig.findUnique({ where: { id: "default" } });
  const config: ScoringConfig = {
    bestOfSets: configRow?.bestOfSets ?? 3,
    tiebreakMode: (configRow?.tiebreakMode as ScoringConfig["tiebreakMode"]) ?? "standard",
  };

  const matches = await prisma.match.findMany({
    include: { player1: true, player2: true, points: { orderBy: { seq: "asc" } } },
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
    },
    courts,
    matches: matchDTOs,
    progress: { completed, total },
    tvControl: getTvControl(),
  };
}
