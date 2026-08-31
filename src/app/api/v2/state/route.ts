import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getFullSnapshot } from "@/lib/bracket/dto";
import { getCourtIds } from "@/lib/bracket/courts";
import { readV2State } from "@/lib/v2/server";
import { computePodium } from "@/lib/v2/podium";
import { computeStateRev, readMemo, writeMemo } from "@/lib/stateRev";
import type { MatchDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * One poll for every v2 and v3 screen: the same snapshot v1 serves, plus the
 * per-court stages, the ceremony, and the live podium.
 *
 * Building that is expensive — every match with every point, replayed through
 * the scoring engine — and between two polls the score has usually not moved.
 * So a client may send the revision it last saw as `?since=`, and gets a tiny
 * "unchanged" reply when it still holds. Callers that send nothing always get
 * the full snapshot, which is what keeps the older screens working untouched.
 */
export async function GET(req: Request) {
  const since = new URL(req.url).searchParams.get("since");
  const rev = await computeStateRev(prisma);

  if (since && since === rev) {
    return NextResponse.json({ unchanged: true, rev });
  }

  // Several devices poll within milliseconds of each other, especially right
  // after a point is scored. They can share one build.
  const cached = readMemo(rev);
  if (cached) return NextResponse.json(cached);

  const snapshot = await getFullSnapshot(prisma);
  const courtIds = await getCourtIds(prisma);
  const v2 = await readV2State(prisma, courtIds);
  const podium = computePodium(snapshot.matches as MatchDTO[], snapshot.tournament.format);
  const body = { ...snapshot, v2: { ...v2, podium }, rev };
  writeMemo(rev, body);
  return NextResponse.json(body);
}
