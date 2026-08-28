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
    await undoLastPoint(prisma, params.id);
    await broadcastSnapshot();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to undo point";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
