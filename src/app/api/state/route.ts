import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getFullSnapshot } from "@/lib/bracket/dto";
import { computeStateRev, readMemo, writeMemo } from "@/lib/stateRev";

export const dynamic = "force-dynamic";

/**
 * v1's snapshot, polled by the original display, scorer and control screens.
 *
 * Same deal as the v2 endpoint: building this loads every match with every
 * point and replays them, and between two polls the score has usually not
 * moved. A client that sends the revision it last saw gets a tiny "unchanged"
 * instead. Sending nothing still returns the whole snapshot, so anything older
 * than this change keeps working exactly as before.
 */
export async function GET(req: Request) {
  const since = new URL(req.url).searchParams.get("since");
  const rev = await computeStateRev(prisma);

  if (since && since === rev) {
    return NextResponse.json({ unchanged: true, rev });
  }

  const cached = readMemo("v1", rev);
  if (cached) return NextResponse.json(cached);

  const snapshot = await getFullSnapshot(prisma);
  const body = { ...snapshot, rev };
  writeMemo("v1", rev, body);
  return NextResponse.json(body);
}
