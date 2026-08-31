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
      include: { member: { select: { name: true } } },
      orderBy: { endedAt: "desc" },
    });
  } catch {
    return [];
  }

  const byMember = new Map<string, MemberSeasonRow>();
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
  }

  const table = [...byMember.values()];
  for (const row of table) row.winRate = row.played > 0 ? row.won / row.played : 0;

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
