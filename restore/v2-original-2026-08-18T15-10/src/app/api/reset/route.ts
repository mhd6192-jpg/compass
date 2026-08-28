import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPin } from "@/lib/auth";
import { broadcastSnapshot } from "@/lib/broadcast";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!(await verifyPin(body.pin))) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }
    await prisma.pointEvent.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.player.deleteMany({});
    await prisma.court.deleteMany({});
    await prisma.tournamentConfig.deleteMany({});
    await broadcastSnapshot();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to reset";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
