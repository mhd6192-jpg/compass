/**
 * Who plays here, as opposed to who is in tonight's draw.
 *
 * A `Player` row lives for one evening: the draw creates it and the next reset
 * deletes it. That was fine while the app was a scoreboard, and useless the
 * moment anybody asked a question spanning two nights — how often someone
 * plays, whether the same four people win everything, who has not been seen
 * since spring. All of it was already being thrown away every week.
 *
 * A `ClubMember` is the person. Entrants are matched to one by name as the draw
 * is seeded, and every archived result is written against one, so the history
 * stops being a pile of strings.
 *
 * Matching is by name and it is automatic. The alternative — asking an
 * organiser to confirm each entrant against a list every week — is a step
 * nobody would keep doing, and the club types the same names from the same
 * saved rosters anyway. What that costs is a typo forking somebody into two
 * people, which `mergeMembers` repairs.
 *
 * Nothing here is allowed to stop an event running. A database without these
 * tables still seeds, still scores and still archives; it simply records no
 * member, and every function below degrades to that rather than throwing.
 */
import type { PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "clubMember" | "memberResult">;

/**
 * The form two entries are considered the same person on.
 *
 * Case and stray whitespace are the differences that happen by accident every
 * week — "ana", "Ana", "Ana " are one person by any reading. Everything else is
 * left alone: guessing that "Ana K." and "Ana K" are the same is the kind of
 * cleverness that silently merges two real people, and merging on purpose is
 * cheap while unpicking a bad guess is not.
 */
export function nameKeyOf(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Finds or creates a member per name, in entry order.
 *
 * Returns an id per input name — null for any name that could not be resolved,
 * including every name when the table does not exist yet. Duplicate names in
 * one draw resolve to the same member, which is correct: the draw has entered
 * one person twice and the record should say so rather than inventing a
 * second.
 *
 * The stored `name` is refreshed to the latest spelling, so correcting "ahmed"
 * to "Ahmed" on the entry form fixes it everywhere without touching history —
 * `MemberResult.playedAs` keeps what each night actually said.
 */
export async function resolveMembers(db: Db, names: string[]): Promise<(string | null)[]> {
  const ids = new Map<string, string>();
  try {
    for (const raw of names) {
      const key = nameKeyOf(raw);
      if (!key || ids.has(key)) continue;
      const name = raw.trim().replace(/\s+/g, " ");
      const row = await db.clubMember.upsert({
        where: { nameKey: key },
        update: { name },
        create: { nameKey: key, name },
      });
      ids.set(key, row.id);
    }
  } catch {
    // No table, or the database is unhappy. An event that cannot be seeded is a
    // far worse outcome than one that is not recorded against anybody.
    return names.map(() => null);
  }
  return names.map((n) => ids.get(nameKeyOf(n)) ?? null);
}

export interface MemberSeasonRow {
  memberId: string;
  name: string;
  events: number;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Wins as a share of matches played, 0–1. Zero when they have played none. */
  winRate: number;
  /** Best finishing position across the events counted. */
  bestRank: number | null;
  /**
   * Mean finishing position as a fraction of the field: 0 is always first, 1 is
   * always last. Normalised on purpose — a third of eight and a third of
   * twenty-four are not the same result, and raw points cannot be compared
   * across a race to 16 and a race to 21 either.
   */
  standing: number;
  /** How many times they finished first. */
  firsts: number;
  lastPlayed: string | null;
}

/**
 * The club table: every member who has finished an event, best first.
 *
 * Ordered by wins rather than win rate, because a rate rewards the person who
 * turned up once and went home — the table people actually want is the one the
 * regulars are at the top of. The rate is shown beside it and can be sorted on
 * in the page.
 */
export async function seasonTable(db: Db, since?: Date): Promise<MemberSeasonRow[]> {
  let rows;
  try {
    rows = await db.memberResult.findMany({
      where: since ? { endedAt: { gte: since } } : undefined,
      // The field size comes from the event: finishing third of eight and third
      // of twenty-four are not the same result.
      include: { member: { select: { name: true } }, event: { select: { entrants: true } } },
      orderBy: { endedAt: "desc" },
    });
  } catch {
    return [];
  }

  const byMember = new Map<string, MemberSeasonRow>();
  const standingSum = new Map<string, number>();
  for (const r of rows) {
    let row = byMember.get(r.memberId);
    if (!row) {
      row = {
        memberId: r.memberId,
        name: r.member.name,
        events: 0,
        played: 0,
        won: 0,
        lost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        winRate: 0,
        bestRank: null,
        standing: 0,
        firsts: 0,
        // Rows arrive newest first, so the first one seen is the latest.
        lastPlayed: r.endedAt.toISOString(),
      };
      byMember.set(r.memberId, row);
    }
    row.events += 1;
    row.played += r.played;
    row.won += r.won;
    row.lost += r.lost;
    row.pointsFor += r.pointsFor;
    row.pointsAgainst += r.pointsAgainst;
    if (row.bestRank === null || r.rank < row.bestRank) row.bestRank = r.rank;
    if (r.rank === 1) row.firsts += 1;
    // Summed here, averaged below. A field of one has no spread to place
    // anybody in, so it counts as a win rather than dividing by zero.
    const field = r.event.entrants;
    standingSum.set(r.memberId, (standingSum.get(r.memberId) ?? 0) + (field > 1 ? (r.rank - 1) / (field - 1) : 0));
  }

  const table = [...byMember.values()];
  for (const row of table) {
    row.winRate = row.played > 0 ? row.won / row.played : 0;
    row.standing = (standingSum.get(row.memberId) ?? 0) / row.events;
  }

  return table.sort(
    (a, b) =>
      b.won - a.won ||
      b.winRate - a.winRate ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
      a.name.localeCompare(b.name)
  );
}

/**
 * Folds one member into another: the loser's results move across, and the
 * loser is deleted.
 *
 * Needed because matching is by name, so one typo makes two people out of one.
 * Where both took part in the same event — which is what a typo inside a single
 * draw looks like — the surviving record is the better finish, since the wrong
 * one is the fragment.
 */
export async function mergeMembers(db: Db, keepId: string, dropId: string): Promise<number> {
  if (keepId === dropId) throw new Error("Pick two different players to merge.");

  const [keep, drop] = await Promise.all([
    db.clubMember.findUnique({ where: { id: keepId } }),
    db.clubMember.findUnique({ where: { id: dropId } }),
  ]);
  if (!keep || !drop) throw new Error("One of those players no longer exists.");

  const [keepResults, dropResults] = await Promise.all([
    db.memberResult.findMany({ where: { memberId: keepId }, select: { eventId: true, rank: true, id: true } }),
    db.memberResult.findMany({ where: { memberId: dropId } }),
  ]);
  const keepByEvent = new Map(keepResults.map((r) => [r.eventId, r]));

  let moved = 0;
  for (const r of dropResults) {
    const clash = keepByEvent.get(r.eventId);
    if (!clash) {
      await db.memberResult.update({ where: { id: r.id }, data: { memberId: keepId } });
      moved++;
      continue;
    }
    // Both halves of the typo played the same night. Keep the better finish and
    // discard the fragment rather than adding two part-events together.
    if (r.rank < clash.rank) {
      await db.memberResult.delete({ where: { id: clash.id } });
      await db.memberResult.update({ where: { id: r.id }, data: { memberId: keepId } });
      moved++;
    } else {
      await db.memberResult.delete({ where: { id: r.id } });
    }
  }

  await db.clubMember.delete({ where: { id: dropId } });
  return moved;
}

/**
 * Puts a list of entered names into strength order for the draw.
 *
 * Several formats read the entry order as a ranking. A mexicano draws its first
 * round straight off it — top four on the first court, next four on the second —
 * and king of the court builds its opening ladder the same way. Organisers were
 * guessing at that order from memory every week, and a wrong guess makes the
 * first round lopsided for everybody.
 *
 * `standing` is a mean finishing position as a fraction of the field, so it
 * compares across different field sizes and different race targets. Lower is
 * stronger.
 *
 * Anyone with no history goes last, keeping the order they were typed in.
 * Putting a newcomer in the middle would be a guess dressed up as a ranking,
 * and in these formats round one sorts them out anyway.
 */
export function orderByStrength(
  names: string[],
  standings: Map<string, number>
): { ordered: string[]; ranked: number; unranked: string[] } {
  const known: { name: string; standing: number; at: number }[] = [];
  const unknown: string[] = [];

  names.forEach((name, at) => {
    const standing = standings.get(nameKeyOf(name));
    if (standing === undefined) unknown.push(name);
    else known.push({ name, standing, at });
  });

  // Entry order breaks ties, so re-ordering an already-sorted list is a no-op
  // rather than a shuffle — an organiser pressing the button twice should not
  // watch the field move.
  known.sort((a, b) => a.standing - b.standing || a.at - b.at);

  return {
    ordered: [...known.map((k) => k.name), ...unknown],
    ranked: known.length,
    unranked: unknown,
  };
}
