import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scorePoint } from "@/lib/bracket/routing";
import { getMatchDTO } from "@/lib/bracket/dto";
import { formatMatchScoreLine } from "@/lib/scoring/format";
import { verifyPin } from "@/lib/auth";
import { broadcastSnapshot } from "@/lib/broadcast";
import { getIO, EVENTS } from "@/lib/socket";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    if (!(await verifyPin(body.pin))) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }
    const slot = body.slot === 1 || body.slot === 2 ? body.slot : null;
    if (!slot) {
      return NextResponse.json({ error: "slot must be 1 or 2" }, { status: 400 });
    }

    const result = await scorePoint(prisma, params.id, slot);
    await broadcastSnapshot();

    const io = getIO();
    io?.emit(EVENTS.MATCH_POINT, {
      matchId: result.matchId,
      tier: result.tier,
      championshipWon: result.championshipWon,
    });

    if (result.completed) {
      const dto = await getMatchDTO(prisma, params.id);
      io?.emit(EVENTS.MATCH_COMPLETED, {
        matchId: dto.id,
        bracket: dto.bracket,
        roundName: dto.roundName,
        winnerName: dto.winnerId === dto.player1?.id ? dto.player1?.name : dto.player2?.name,
        loserName: dto.winnerId === dto.player1?.id ? dto.player2?.name : dto.player1?.name,
        scoreLine: formatMatchScoreLine(dto),
        courtId: dto.courtId,
        isChampionshipFinal: dto.isChampionshipFinal,
      });
    }

    return NextResponse.json({ ok: true, tier: result.tier, completed: result.completed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to score point";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
