import type { PrismaClient } from "@prisma/client";

/**
 * A cheap fingerprint of everything the snapshot is built from.
 *
 * Every screen polls the full state several times a second, and building that
 * state is not cheap: it loads every match with every point event and replays
 * them all through the scoring engine. Measured on a full evening — 28 matches,
 * 616 points — that is 58ms and 32KB per poll. Twelve devices at 800ms is 87%
 * of a core and half a megabyte a second, spent almost entirely on telling
 * people something they already know, because between two polls the score has
 * usually not moved.
 *
 * So the client sends the revision it last saw and the server answers
 * "unchanged" when it still holds. This computes that revision without
 * transferring or deserialising anything: the aggregation happens inside
 * Postgres and one short string comes back.
 *
 * It has to be exact rather than approximate, because a missed change means a
 * TV that never updates. Counts alone are not enough — undoing a point and
 * scoring it to the other side leaves the count identical and the score
 * different — so the point rows are hashed by (match, seq, slot) rather than
 * counted. Everything else that can move a screen is folded in the same way.
 */
export interface StateRev {
  rev: string;
}

interface RevRow {
  points: string | null;
  matches: string | null;
  players: string | null;
  courts: string | null;
  stages: string | null;
  ceremony: string | null;
  config: string | null;
}

export async function computeStateRev(prisma: PrismaClient): Promise<string> {
  // One round trip. Each subquery is a scan of a small table — or, for the
  // points, a hash of rows that are never sent anywhere.
  const rows = await prisma.$queryRawUnsafe<RevRow[]>(`
    select
      (select md5(coalesce(string_agg("matchId" || ':' || seq || ':' || slot, ',' order by "matchId", seq), '')) from "PointEvent") as points,
      (select md5(coalesce(string_agg(
         id || ':' || status || ':' || coalesce("courtId"::text,'') || ':' || coalesce("courtSlot",'')
            || ':' || coalesce("winnerId",'') || ':' || coalesce("player1Id",'') || ':' || coalesce("player2Id",'')
            || ':' || coalesce("player1PartnerId",'') || ':' || coalesce("player2PartnerId",''),
         ',' order by id), '')) from "Match") as matches,
      (select md5(coalesce(string_agg(id || ':' || name || ':' || team || ':' || "pairGroup", ',' order by id), '')) from "Player") as players,
      (select md5(coalesce(string_agg(id || ':' || label, ',' order by id), '')) from "Court") as courts,
      (select md5(coalesce(string_agg("courtId" || ':' || stage || ':' || rev || ':' || coalesce("activeMatchId",''), ',' order by "courtId"), '')) from "CourtStage") as stages,
      (select md5(coalesce(string_agg(id || ':' || stage || ':' || rev || ':' || cursor, ',' order by id), '')) from "Ceremony") as ceremony,
      (select md5(coalesce(string_agg(
         id || ':' || status || ':' || format || ':' || discipline || ':' || "bestOfSets" || ':' || "tiebreakMode"
            || ':' || "raceTarget" || ':' || "serveEvery" || ':' || "raceWinBy" || ':' || "amRounds",
         ',' order by id), '')) from "TournamentConfig") as config
  `);

  const r = rows[0] ?? ({} as RevRow);
  return [r.points, r.matches, r.players, r.courts, r.stages, r.ceremony, r.config]
    .map((x) => (x ?? "").slice(0, 8))
    .join("-");
}

/**
 * The last snapshot computed, kept for a moment so simultaneous pollers share
 * one computation instead of each doing their own.
 *
 * Keyed on the revision, so it can never serve something stale: a different
 * revision means a different key and a fresh build. The window is short because
 * its only job is to collapse the burst of polls that arrive together after a
 * point is scored — on a serverless host each instance has its own, which is
 * fine, since this is an optimisation and not a source of truth.
 */
const MEMO_MS = 400;
let memo: { rev: string; body: unknown; at: number } | null = null;

export function readMemo(rev: string): unknown | null {
  if (!memo || memo.rev !== rev) return null;
  if (Date.now() - memo.at > MEMO_MS) return null;
  return memo.body;
}

export function writeMemo(rev: string, body: unknown): void {
  memo = { rev, body, at: Date.now() };
}
