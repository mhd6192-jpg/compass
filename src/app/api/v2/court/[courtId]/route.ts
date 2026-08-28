import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPin } from "@/lib/auth";
import { writeCourtStage } from "@/lib/v2/server";

/**
 * The coach's two buttons for their own court.
 *
 * "live"   — put this court's match on the TV as a full-screen scoreboard.
 * "finish" — release the winner celebration; the TV returns to the upcoming
 *            match and the standings.
 */
export async function POST(req: Request, { params }: { params: { courtId: string } }) {
  try {
    const body = await req.json();
    if (!(await verifyPin(body.pin))) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    const courtId = Number(params.courtId);
    if (!Number.isInteger(courtId)) {
      return NextResponse.json({ error: "Bad court" }, { status: 400 });
    }

    const coachName = typeof body.coachName === "string" && body.coachName.trim() ? body.coachName.trim().slice(0, 40) : undefined;

    if (body.action === "live") {
      const matchId = typeof body.matchId === "string" ? body.matchId : null;
      if (!matchId) return NextResponse.json({ error: "No match to put on air" }, { status: 400 });
      const match = await prisma.match.findUnique({ where: { id: matchId } });
      if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
      if (!match.player1Id || !match.player2Id) {
        return NextResponse.json({ error: "Both players must be known before going live" }, { status: 400 });
      }
      const stage = await writeCourtStage(prisma, courtId, { stage: "live", activeMatchId: matchId, coachName });
      return NextResponse.json({ ok: true, stage });
    }

    if (body.action === "finish") {
      const stage = await writeCourtStage(prisma, courtId, { stage: "idle", activeMatchId: null, coachName });
      return NextResponse.json({ ok: true, stage });
    }

    if (body.action === "coach") {
      const stage = await writeCourtStage(prisma, courtId, { stage: body.stage === "live" ? "live" : "idle", coachName });
      return NextResponse.json({ ok: true, stage });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update the court screen";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
