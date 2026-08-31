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

/** One person's line, ready to be written against a club member. */
export interface ArchivedMemberResult {
  memberId: string;
  playedAs: string;
  rank: number;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
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
  /**
   * The individual table again, keyed to people who outlive the reset. Empty
   * where no entrant matched a member — an older draw, or a database without
   * the members tables — and the archive is written exactly as before.
   */
  members: ArchivedMemberResult[];
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
 * Attaches the individual table to the people it belongs to.
 *
 * The standings are keyed by Player, which is about to be deleted. This walks
 * back to the ClubMember each entrant was matched to when the draw was seeded,
 * so the same numbers survive as somebody's record.
 *
 * Entrants with no member — an older draw, a database without the tables — are
 * simply left out. And where one person was entered twice, only their better
 * finish is kept: one row per person per event is what the record means.
 */
async function memberRows(prisma: PrismaClient, individual: StandingsRow[]): Promise<ArchivedMemberResult[]> {
  let roster: { id: string; memberId: string | null }[];
  try {
    roster = await prisma.player.findMany({ select: { id: true, memberId: true } });
  } catch {
    return [];
  }
  const memberOf = new Map(roster.map((p) => [p.id, p.memberId]));

  const seen = new Set<string>();
  const rows: ArchivedMemberResult[] = [];
  // The table arrives already ranked, so the first sighting of a member is
  // their best placing and the index is the position the table showed.
  individual.forEach((row, i) => {
    const memberId = memberOf.get(row.id);
    if (!memberId || seen.has(memberId)) return;
    seen.add(memberId);
    rows.push({
      memberId,
      playedAs: row.name,
      rank: i + 1,
      played: row.played,
      won: row.won,
      lost: row.lost,
      pointsFor: row.pointsFor,
      pointsAgainst: row.pointsAgainst,
    });
  });
  return rows;
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
  const members = await memberRows(prisma, individual);



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
    members,
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
    // Written separately, and allowed to fail on its own. The event record is
    // the thing that must not be lost; a club that cannot yet keep per-person
    // history should still get its night saved.
    if (payload.members.length > 0) {
      try {
        await prisma.memberResult.createMany({
          data: payload.members.map((m) => ({ ...m, eventId: row.id, endedAt: payload.endedAt })),
        });
      } catch {
        // No table yet, or a member deleted between building and writing.
      }
    }

    return row.id;
  } catch {
    // A database without the table yet must not make resetting impossible —
    // losing the archive is bad, being unable to start the next event is worse.
    return null;
  }
}
