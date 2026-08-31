/**
 * Keeping a finished tournament after the draw that produced it is wiped.
 *
 * Resetting deletes every Player, Match and PointEvent — that is what makes a
 * new event possible — and it used to destroy the record of the night that had
 * just been played along with them. So the archive is written BEFORE the wipe,
 * and a reset stops being a way to lose results.
 *
 * Everything is denormalised on purpose. The rows this describes are about to
 * cease to exist, so nothing here may point at them, and a format's title or
 * scoring rules may read differently by the time someone looks back. What is
 * stored is what the screens showed on the night.
 */
import type { PrismaClient } from "@prisma/client";
import { getFullSnapshot } from "./bracket/dto";
import { computeStandings, computeTeamStandings, type StandingsRow } from "./standings";
import { computePodium } from "./v2/podium";
import { formatMatchScoreLine } from "./scoring/format";
import { formatSpec } from "./bracket/formats";
import { isTeamScored, matchFormatLabel, pairLabel, tallyUnit, type MatchDTO } from "./types";

export interface ArchivedResult {
  round: number;
  roundName: string;
  bracket: string;
  side1: string;
  side2: string;
  /** 1 or 2 — which side won. */
  winner: 1 | 2;
  score: string;
  /** Set when the match did not play out, e.g. "Retired". */
  endedEarly: string | null;
  completedAt: string | null;
}

export interface ArchivePayload {
  label: string;
  format: string;
  formatName: string;
  scoring: string;
  tallyUnit: string;
  entrants: number;
  matches: number;
  standings: StandingsRow[];
  players: StandingsRow[] | null;
  podium: ReturnType<typeof computePodium>;
  results: ArchivedResult[];
  startedAt: Date | null;
  endedAt: Date;
}

function sideName(match: MatchDTO, slot: 1 | 2): string {
  const members = slot === 1 ? match.player1Members : match.player2Members;
  if (members?.length) return pairLabel(members.map((p) => p.name));
  return (slot === 1 ? match.player1?.name : match.player2?.name) ?? "TBD";
}

/** A readable default name, since most organisers will not bother typing one. */
export function defaultLabel(formatName: string, when: Date): string {
  const date = when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${formatName} · ${date}`;
}

/**
 * Builds the record from whatever is currently in the database.
 *
 * Returns null when there is nothing worth keeping — no completed match means
 * no result, and archiving an untouched draw would fill the history with empty
 * rows every time someone re-seeded.
 */
export async function buildArchive(prisma: PrismaClient, label?: string): Promise<ArchivePayload | null> {
  const snapshot = (await getFullSnapshot(prisma)) as unknown as {
    tournament: { format: string; bestOfSets: number; tiebreakMode: string; raceTarget?: number; serveEvery?: number; raceWinBy?: number; startedAt?: string | null };
    matches: MatchDTO[];
  };

  const played = snapshot.matches.filter((m) => m.status === "completed" && m.winnerId);
  if (played.length === 0) return null;

  const format = snapshot.tournament.format;
  const teamScored = isTeamScored(format);
  const individual = computeStandings(snapshot.matches);

  const results: ArchivedResult[] = played
    .slice()
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""))
    .map((m) => ({
      round: m.round,
      roundName: m.roundName,
      bracket: m.bracket,
      side1: sideName(m, 1),
      side2: sideName(m, 2),
      winner: m.winnerId === m.player1?.id ? 1 : 2,
      score: formatMatchScoreLine(m),
      endedEarly: m.forcedEnd ? m.forcedEndReason ?? "Ended early" : null,
      completedAt: m.completedAt,
    }));

  const endedAt = new Date();
  const formatName = formatSpec(format).title;

  return {
    label: label?.trim() || defaultLabel(formatName, endedAt),
    format,
    formatName,
    scoring: matchFormatLabel(snapshot.tournament.bestOfSets, snapshot.tournament),
    tallyUnit: tallyUnit(snapshot.tournament.tiebreakMode).short,
    entrants: individual.length,
    matches: played.length,
    // A team format is decided by the team table, so that is the headline one —
    // the individual scorers are kept beside it rather than instead of it.
    standings: teamScored ? computeTeamStandings(snapshot.matches) : individual,
    players: teamScored ? individual : null,
    podium: computePodium(snapshot.matches, format),
    results,
    startedAt: snapshot.tournament.startedAt ? new Date(snapshot.tournament.startedAt) : null,
    endedAt,
  };
}

/** Writes the archive, if there is anything to write. Returns its id, or null. */
export async function archiveCurrentTournament(prisma: PrismaClient, label?: string): Promise<string | null> {
  const payload = await buildArchive(prisma, label);
  if (!payload) return null;
  try {
    const row = await prisma.archivedTournament.create({
      data: {
        label: payload.label,
        format: payload.format,
        formatName: payload.formatName,
        scoring: payload.scoring,
        tallyUnit: payload.tallyUnit,
        entrants: payload.entrants,
        matches: payload.matches,
        standings: payload.standings as unknown as object[],
        players: (payload.players ?? undefined) as unknown as object[] | undefined,
        podium: payload.podium as unknown as object[],
        results: payload.results as unknown as object[],
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
      },
    });
    return row.id;
  } catch {
    // A database without the table yet must not make resetting impossible —
    // losing the archive is bad, being unable to start the next event is worse.
    return null;
  }
}
