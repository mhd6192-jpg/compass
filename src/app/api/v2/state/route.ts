import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getFullSnapshot } from "@/lib/bracket/dto";
import { getCourtIds } from "@/lib/bracket/courts";
import { readV2State } from "@/lib/v2/server";
import { computePodium } from "@/lib/v2/podium";
import type { MatchDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * One poll for every v2 screen: the same snapshot v1 serves, plus the per-court
 * stages, the ceremony, and the live podium (so the organiser's remote can show
 * who is currently in line for each medal before freezing it).
 */
export async function GET() {
  const snapshot = await getFullSnapshot(prisma);
  const courtIds = await getCourtIds(prisma);
  const v2 = await readV2State(prisma, courtIds);
  const podium = computePodium(snapshot.matches as MatchDTO[], snapshot.tournament.format);
  return NextResponse.json({ ...snapshot, v2: { ...v2, podium } });
}
