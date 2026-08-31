import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPin } from "@/lib/auth";
import { broadcastSnapshot } from "@/lib/broadcast";
import { resetV2State } from "@/lib/v2/reset";
import { archiveCurrentTournament } from "@/lib/archive";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!(await verifyPin(body.pin))) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    // Keep the night before deleting it. This is the whole reason the archive
    // exists: a reset is how you start the next event, and it used to be the
    // way people lost the last one. Nothing is archived if no match was ever
    // completed, so re-seeding an untouched draw does not litter the history.
    // `skipArchive` is for the rare deliberate discard.
    const archivedId = body.skipArchive === true ? null : await archiveCurrentTournament(prisma, body.archiveLabel);

    await prisma.pointEvent.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.player.deleteMany({});
    await prisma.court.deleteMany({});
    await prisma.tournamentConfig.deleteMany({});
    await resetV2State(prisma);
    await broadcastSnapshot();
    return NextResponse.json({ ok: true, archivedId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to reset";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
