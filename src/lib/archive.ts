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
import type { AwardDTO } from "./v2/stage";
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
 * The order the event actually finished in.
 *
 * `computeStandings` deliberately leaves the semifinals and the final out of the
 * record — they settle placings, they are not part of the group table. That is
 * right for the table on the wall and wrong for a record of who won: a compass
 * or two-group event archived the GROUP table, so whoever topped their group sat
 * at position 1 even when they lost the final, and the podium stored beside it
 * said someone else. `MemberResult.rank` comes from this order, and the club
 * table reads rank 1 as "won the event", so the wrong person collected the win.
 *
 * A team format has the same problem one step further out: the event is decided
 * by the team table, but the members were ranked on individual points, so the
 * top scorer collected a win even when their team lost.
 *
 * So the order is taken from whatever actually decided the event, and falls back
 * to the table itself where nothing else does — a round robin without a play-off
 * is settled by its table and needs no help.
 */
function finalPlacings(
  matches: MatchDTO[],
  format: string,
  individual: StandingsRow[],
  teamTable: StandingsRow[]
): StandingsRow[] {
  if (isTeamScored(format)) {
    // Everyone on the winning side won it. Within a side the individual table
    // still orders them, which is the only ordering that means anything there.
    const teamRank = new Map(teamTable.map((t, i) => [t.id, i]));
    const teamOf = new Map<string, string>();
    for (const m of matches) {
      for (const p of [...(m.player1Members ?? []), ...(m.player2Members ?? [])]) {
        if (p.team) teamOf.set(p.id, `team-${p.team}`);
      }
    }
    return individual
      .map((row, i) => ({ row, i, rank: teamRank.get(teamOf.get(row.id) ?? "") ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.row);
  }

  // Only the ORDER is read here, so the wording argument is beside the point.
  const podium = computePodium(matches, format);
  const place = new Map(podium.map((a) => [a.playerId, a.place]));
  // A podium of team ids, or one nobody in the table matches, settles nothing
  // about these rows and is left alone.
  if (!individual.some((row) => place.has(row.id))) return individual;

  return individual
    .map((row, i) => ({ row, i, place: place.get(row.id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.place - b.place || a.i - b.i)
    .map((x) => x.row);
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
    tournament: { format: string; bestOfSets: number; tiebreakMode: string; raceTarget?: number; serveEvery?: number; raceWinBy?: number; gamesPerSet?: number; goldenPoint?: boolean };
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

  // Read from the config rather than the snapshot. The snapshot is what every
  // screen polls several times a second and it has no business carrying a field
  // only the archive reads — and this one has to be exact, because it is what
  // says whether two saves describe the same night.
  const started = await prisma.tournamentConfig.findUnique({
    where: { id: "default" },
    select: { startedAt: true },
  });
  const startedAt = started?.startedAt ?? null;

  // The podium the club actually announced, where there was one.
  //
  // `Ceremony.awards` is frozen the moment the presentation starts, on purpose,
  // so a late score correction cannot reshuffle the names while somebody is
  // reading them out. The archive recomputed the podium from the matches as they
  // stood at reset time and `resetV2State` then deleted the ceremony row — so a
  // point landing after the ceremony began quietly changed the recorded result,
  // and the frozen record of what was said out loud was gone for good.
  //
  // Guarded like the other v2 tables: an installation without them archives the
  // computed podium, which is what it did before any of this existed.
  let announced: AwardDTO[] | null = null;
  try {
    const ceremony = await prisma.ceremony.findUnique({ where: { id: "default" } });
    if (ceremony && ceremony.stage !== "idle" && Array.isArray(ceremony.awards) && ceremony.awards.length > 0) {
      announced = ceremony.awards as unknown as AwardDTO[];
    }
  } catch {
    /* no ceremony table on this installation */
  }
  // The club's record of the night is ranked by what actually decided it, not by
  // the group table the wall screens were showing when the last match finished.
  const teamTable = computeTeamStandings(snapshot.matches);
  const placings = finalPlacings(snapshot.matches, format, individual, teamTable);
  const members = await memberRows(prisma, placings);

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
    standings: teamScored ? teamTable : placings,
    players: teamScored ? individual : null,
    podium: announced ?? computePodium(snapshot.matches, format, snapshot.tournament.tiebreakMode),
    results,
    startedAt,
    endedAt,
    members,
  };
}

/** Writes the archive, if there is anything to write. Returns its id, or null. */
export async function archiveCurrentTournament(prisma: PrismaClient, label?: string): Promise<string | null> {
  const payload = await buildArchive(prisma, label);
  if (!payload) return null;

  // Whether the organiser actually typed a name. `buildArchive` has already
  // filled in a default, which must not be allowed to overwrite a name they
  // gave earlier in the evening.
  const named = typeof label === "string" && label.trim().length > 0;

  try {
    const fields = {
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
      endedAt: payload.endedAt,
    };

    // Saving mid-evening and then resetting at the end is now the ordinary
    // flow, and both writes describe the same night — so the second updates the
    // first instead of leaving a half-played duplicate sitting in the history
    // beside the finished one. `startedAt` is stamped when the draw is seeded,
    // to the millisecond, so it names one run of one event and nothing else.
    const existing = payload.startedAt
      ? await prisma.archivedTournament.findFirst({ where: { startedAt: payload.startedAt } })
      : null;

    const row = existing
      ? await prisma.archivedTournament.update({
          where: { id: existing.id },
          data: named ? { ...fields, label: payload.label } : fields,
        })
      : await prisma.archivedTournament.create({
          data: { ...fields, label: payload.label, startedAt: payload.startedAt },
        });

    // Written separately, and allowed to fail on its own. The event record is
    // the thing that must not be lost; a club that cannot yet keep per-person
    // history should still get its night saved.
    try {
      // Replaced rather than merged: an update is a later, fuller picture of
      // the same night, and a line from the earlier save would otherwise stay
      // behind reporting a score that has since moved on.
      if (existing) await prisma.memberResult.deleteMany({ where: { eventId: row.id } });
      if (payload.members.length > 0) {
        await prisma.memberResult.createMany({
          data: payload.members.map((m) => ({ ...m, eventId: row.id, endedAt: payload.endedAt })),
        });
      }
    } catch {
      // No table yet, or a member deleted between building and writing.
    }

    return row.id;
  } catch {
    // A database without the table yet must not make resetting impossible —
    // losing the archive is bad, being unable to start the next event is worse.
    return null;
  }
}
