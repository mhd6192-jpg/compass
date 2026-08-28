/**
 * Server-side reads and writes for the v2 court stages and the ceremony.
 *
 * Everything here tolerates the v2 tables not existing yet (`prisma db push`
 * hasn't been run against this database). Rather than 500-ing the TV, the read
 * path reports `ready: false` and the v2 screens show a one-line setup notice —
 * a silent in-memory fallback would be worse, because on Vercel it would
 * "work" on the coach's phone and never reach the TV.
 */
import type { PrismaClient } from "@prisma/client";
import { getFullSnapshot } from "../bracket/dto";
import type { MatchDTO } from "../types";
import { buildAwards, computePodium } from "./podium";
import {
  AwardDTO,
  CeremonyDTO,
  CeremonyStage,
  CourtStageDTO,
  IDLE_CEREMONY,
  StoredCourtStage,
  V2StateDTO,
  emptyCourtStage,
} from "./stage";

const CEREMONY_ID = "default";

/** P2021 = "the table does not exist in the current database". */
function isMissingTable(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  if (code === "P2021" || code === "P2022") return true;
  const msg = e instanceof Error ? e.message : "";
  return /does not exist in the current database|relation .* does not exist/i.test(msg);
}

function toCourtStageDTO(row: {
  courtId: number;
  stage: string;
  activeMatchId: string | null;
  coachName: string | null;
  rev: number;
}): CourtStageDTO {
  return {
    courtId: row.courtId,
    stage: row.stage === "live" ? "live" : "idle",
    activeMatchId: row.activeMatchId,
    coachName: row.coachName,
    rev: row.rev,
  };
}

function toCeremonyDTO(row: { stage: string; places: unknown; cursor: number; awards: unknown; rev: number }): CeremonyDTO {
  const places = Array.isArray(row.places) ? (row.places as number[]) : [];
  const awards = Array.isArray(row.awards) ? (row.awards as AwardDTO[]) : [];
  const stage = (["idle", "standby", "revealing", "complete"] as CeremonyStage[]).includes(row.stage as CeremonyStage)
    ? (row.stage as CeremonyStage)
    : "idle";
  return { stage, places, cursor: row.cursor, awards, rev: row.rev };
}

/** Court stages for every court in play, creating nothing — missing rows read as idle. */
export async function readV2State(prisma: PrismaClient, courtIds: number[]): Promise<V2StateDTO> {
  try {
    const [stageRows, ceremonyRow] = await Promise.all([
      prisma.courtStage.findMany({ orderBy: { courtId: "asc" } }),
      prisma.ceremony.findUnique({ where: { id: CEREMONY_ID } }),
    ]);
    const byCourt = new Map(stageRows.map((r) => [r.courtId, toCourtStageDTO(r)]));
    return {
      ready: true,
      courts: courtIds.map((id) => byCourt.get(id) ?? emptyCourtStage(id)),
      ceremony: ceremonyRow ? toCeremonyDTO(ceremonyRow) : IDLE_CEREMONY,
    };
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    return { ready: false, courts: courtIds.map(emptyCourtStage), ceremony: IDLE_CEREMONY };
  }
}

/** Puts a court on air (or takes it off). Bumps `rev` so clients can tell the change apart from a no-op poll. */
export async function writeCourtStage(
  prisma: PrismaClient,
  courtId: number,
  patch: { stage: StoredCourtStage; activeMatchId?: string | null; coachName?: string | null }
): Promise<CourtStageDTO> {
  const existing = await prisma.courtStage.findUnique({ where: { courtId } });
  const data = {
    stage: patch.stage,
    activeMatchId: patch.activeMatchId === undefined ? existing?.activeMatchId ?? null : patch.activeMatchId,
    coachName: patch.coachName === undefined ? existing?.coachName ?? null : patch.coachName,
    rev: (existing?.rev ?? 0) + 1,
  };
  const row = await prisma.courtStage.upsert({ where: { courtId }, create: { courtId, ...data }, update: data });
  return toCourtStageDTO(row);
}

async function readCeremonyRow(prisma: PrismaClient) {
  return (
    (await prisma.ceremony.findUnique({ where: { id: CEREMONY_ID } })) ??
    (await prisma.ceremony.create({ data: { id: CEREMONY_ID, places: [], awards: [] } }))
  );
}

async function writeCeremony(
  prisma: PrismaClient,
  data: { stage: CeremonyStage; places?: number[]; cursor: number; awards?: AwardDTO[] },
  rev: number
): Promise<CeremonyDTO> {
  const row = await prisma.ceremony.update({
    where: { id: CEREMONY_ID },
    data: {
      stage: data.stage,
      cursor: data.cursor,
      rev: rev + 1,
      ...(data.places ? { places: data.places } : {}),
      ...(data.awards ? { awards: data.awards as unknown as object[] } : {}),
    },
  });
  return toCeremonyDTO(row);
}

export type CeremonyAction = "configure" | "start" | "next" | "back" | "reset";

/**
 * Drives the presentation from the organiser's phone. Deliberately one step per
 * tap: after "and the runner-up is…" nothing moves until they press again, so
 * the medal, the handshake and the photo all happen before the champion's name
 * is on screen.
 */
export async function runCeremonyAction(
  prisma: PrismaClient,
  action: CeremonyAction,
  payload: { places?: number[] } = {}
): Promise<CeremonyDTO> {
  const row = await readCeremonyRow(prisma);
  const cur = toCeremonyDTO(row);

  switch (action) {
    case "configure": {
      const requested = Array.isArray(payload.places) ? payload.places.map(Number) : [];
      const snapshot = await getFullSnapshot(prisma);
      const podium = computePodium(snapshot.matches as MatchDTO[], snapshot.tournament.format);
      const { places } = buildAwards(podium, requested);
      if (places.length === 0) throw new Error("Pick at least one place to announce");
      // Changing the running order mid-presentation would be chaos on screen —
      // reconfiguring always drops back to a clean, not-yet-started ceremony.
      return writeCeremony(prisma, { stage: "idle", places, cursor: -1, awards: [] }, cur.rev);
    }

    case "start": {
      const snapshot = await getFullSnapshot(prisma);
      const podium = computePodium(snapshot.matches as MatchDTO[], snapshot.tournament.format);
      const { awards, places } = buildAwards(podium, cur.places.length ? cur.places : [3, 2, 1]);
      if (awards.length === 0) throw new Error("No finished results to announce yet");
      return writeCeremony(prisma, { stage: "standby", places, cursor: -1, awards }, cur.rev);
    }

    case "next": {
      if (cur.stage === "idle") throw new Error("Start the presentation first");
      if (cur.stage === "complete") return cur;
      const nextCursor = cur.cursor + 1;
      if (nextCursor >= cur.places.length) {
        return writeCeremony(prisma, { stage: "complete", cursor: cur.places.length - 1 }, cur.rev);
      }
      return writeCeremony(prisma, { stage: "revealing", cursor: nextCursor }, cur.rev);
    }

    case "back": {
      if (cur.stage === "complete") {
        return writeCeremony(prisma, { stage: "revealing", cursor: cur.places.length - 1 }, cur.rev);
      }
      if (cur.stage !== "revealing") return cur;
      if (cur.cursor <= 0) return writeCeremony(prisma, { stage: "standby", cursor: -1 }, cur.rev);
      return writeCeremony(prisma, { stage: "revealing", cursor: cur.cursor - 1 }, cur.rev);
    }

    case "reset":
      // Keeps the chosen places so the organiser doesn't have to pick again.
      return writeCeremony(prisma, { stage: "idle", cursor: -1, awards: [] }, cur.rev);
  }
}
