import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { archiveCurrentTournament } from "@/lib/archive";
import { checkPin } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Past events, newest first — the list view only, without the bulky JSON. */
export async function GET() {
  try {
    const rows = await prisma.archivedTournament.findMany({
      orderBy: { endedAt: "desc" },
      select: {
        id: true,
        label: true,
        format: true,
        formatName: true,
        scoring: true,
        entrants: true,
        matches: true,
        startedAt: true,
        endedAt: true,
      },
    });
    return NextResponse.json({
      events: rows.map((r) => ({ ...r, startedAt: r.startedAt?.toISOString() ?? null, endedAt: r.endedAt.toISOString() })),
    });
  } catch {
    // Before `prisma db push` has run, an empty history reads better than a 500.
    return NextResponse.json({ events: [] });
  }
}

/** Archive the tournament that is running now, without resetting it. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await checkPin(req, "organiser", body.pin);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const id = await archiveCurrentTournament(prisma, typeof body.label === "string" ? body.label : undefined);
    if (!id) {
      return NextResponse.json({ error: "Nothing to save yet — no match has been completed." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 });
  }
}
