import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Every name the club knows, for the entry form to suggest.
 *
 * Separate from `/api/members` because that one is the results table and only
 * contains people who have finished an event. This is everybody on record,
 * including whoever was entered last week in a draw that was abandoned — the
 * form wants to offer those too, since offering a name is the cheapest way to
 * stop somebody typing a new spelling of it.
 */
export async function GET() {
  try {
    const rows = await prisma.clubMember.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
      take: 500,
    });
    return NextResponse.json({ names: rows.map((r) => r.name) });
  } catch {
    // No table yet. An entry form with no suggestions is the old behaviour.
    return NextResponse.json({ names: [] });
  }
}
