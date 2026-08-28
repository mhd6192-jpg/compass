import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { manualAssignCourt, getCourtIds } from "@/lib/bracket/courts";
import { verifyPin } from "@/lib/auth";
import { broadcastSnapshot } from "@/lib/broadcast";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    if (!(await verifyPin(body.pin))) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }
    const courtId = Number(body.courtId);
    const slot = body.slot === "current" || body.slot === "next" ? body.slot : null;
    const courtIds = await getCourtIds(prisma);
    if (!courtIds.includes(courtId) || !slot) {
      return NextResponse.json({ error: `courtId (${courtIds.join("|")}) and slot ('current'|'next') are required` }, { status: 400 });
    }
    await manualAssignCourt(prisma, params.id, courtId, slot);
    await broadcastSnapshot();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to reassign court";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
