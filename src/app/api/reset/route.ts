import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkPin } from "@/lib/rateLimit";
import { broadcastSnapshot } from "@/lib/broadcast";
import { resetV2State } from "@/lib/v2/reset";
import { archiveCurrentTournament } from "@/lib/archive";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // The organiser PIN, not the coach one. Wiping a draw is the single most
    // destructive thing here, and the whole point of separating the two is that
    // the eight people holding the scoring PIN cannot do it. It also has to be
    // a PIN that outlives the tournament, since this is what deletes the row
    // the coach PIN lives on.
    const auth = await checkPin(req, "organiser", body.pin);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Keep the night before deleting it. This is the whole reason the archive
    // exists: a reset is how you start the next event, and it used to be the
    // way people lost the last one. Nothing is archived if no match was ever
    // completed, so re-seeding an untouched draw does not litter the history.
    // `skipArchive` is for the rare deliberate discard.
    const archivedId = body.skipArchive === true ? null : await archiveCurrentTournament(prisma, body.archiveLabel);

    // One transaction, not five statements. A connection dropped between them
    // left the most destructive operation in the app half-done — a config row
    // still saying "active" with no players and no matches behind it, which
    // every screen reads as a live tournament that cannot be played or reseeded.
    //
    // `resetV2State` stays OUTSIDE it. It tolerates a database that has never
    // had the v2 tables pushed, by catching the "no such relation" error — but
    // inside a transaction that error has already aborted the whole thing, so
    // catching it achieves nothing: the COMMIT becomes a silent ROLLBACK and
    // the wipe is undone while the route still answers ok. Out here the catch
    // means what it says, and the wipe above has already been committed.
    //
    // The timeout is generous on purpose: this runs straight after archiving,
    // and deletes an evening of point events over a connection that may be
    // waking from scale-to-zero. Prisma's 5s default is not enough for that,
    // and a P2028 here reads to the organiser as a failed reset.
    await prisma.$transaction(
      async (tx) => {
        await tx.pointEvent.deleteMany({});
        await tx.match.deleteMany({});
        await tx.player.deleteMany({});
        await tx.court.deleteMany({});
        await tx.tournamentConfig.deleteMany({});
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
    await resetV2State(prisma);
    await broadcastSnapshot();
    return NextResponse.json({ ok: true, archivedId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to reset";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
