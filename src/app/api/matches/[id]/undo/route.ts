import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { undoLastPoint } from "@/lib/bracket/routing";
import { verifyPin } from "@/lib/auth";
import { broadcastSnapshot } from "@/lib/broadcast";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    if (!(await verifyPin(body.pin))) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }
    const expectedLastSeq = Number.isInteger(body.expectedLastSeq) && body.expectedLastSeq > 0 ? body.expectedLastSeq : undefined;
    const { removed } = await undoLastPoint(prisma, params.id, expectedLastSeq);
    await broadcastSnapshot();
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to undo point";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
