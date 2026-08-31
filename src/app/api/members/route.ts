import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { seasonTable } from "@/lib/members";

export const dynamic = "force-dynamic";

/**
 * The club table, built from every archived event.
 *
 * `?since=2026-01-01` cuts it to a season; without it the table is all time.
 */
export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("since");
    const since = raw ? new Date(raw) : undefined;
    const table = await seasonTable(prisma, since && !Number.isNaN(since.getTime()) ? since : undefined);
    return NextResponse.json({ members: table });
  } catch {
    // Before `prisma db push` has run, an empty table reads better than a 500.
    return NextResponse.json({ members: [] });
  }
}
