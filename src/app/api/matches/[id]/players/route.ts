import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkPin } from "@/lib/rateLimit";
import { broadcastSnapshot } from "@/lib/broadcast";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const auth = await checkPin(req, "coach", body.pin);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const player1Name = typeof body.player1Name === "string" ? body.player1Name.trim() : undefined;
    const player2Name = typeof body.player2Name === "string" ? body.player2Name.trim() : undefined;

    const match = await prisma.match.findUniqueOrThrow({ where: { id: params.id } });

    if (player1Name) {
      if (!match.player1Id) throw new Error("Player 1 is not yet determined for this match");
      await prisma.player.update({ where: { id: match.player1Id }, data: { name: player1Name } });
    }
    if (player2Name) {
      if (!match.player2Id) throw new Error("Player 2 is not yet determined for this match");
      await prisma.player.update({ where: { id: match.player2Id }, data: { name: player2Name } });
    }

    await broadcastSnapshot();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to rename player";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
