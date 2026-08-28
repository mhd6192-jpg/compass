import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { forceEndMatch } from "@/lib/bracket/routing";
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
    const winnerSlot = body.winnerSlot === 1 || body.winnerSlot === 2 ? body.winnerSlot : null;
    if (!winnerSlot) {
      return NextResponse.json({ error: "winnerSlot must be 1 or 2" }, { status: 400 });
    }
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "Forced end";

    const result = await forceEndMatch(prisma, params.id, winnerSlot, reason);
    await broadcastSnapshot();

    const io = getIO();
    io?.emit(EVENTS.MATCH_POINT, {
      matchId: params.id,
      tier: result.championshipWon ? "champion" : "match",
      championshipWon: result.championshipWon,
    });

    const dto = await getMatchDTO(prisma, params.id);
    io?.emit(EVENTS.MATCH_COMPLETED, {
      matchId: dto.id,
      bracket: dto.bracket,
      roundName: dto.roundName,
      winnerName: dto.winnerId === dto.player1?.id ? dto.player1?.name : dto.player2?.name,
      loserName: dto.winnerId === dto.player1?.id ? dto.player2?.name : dto.player1?.name,
      scoreLine: formatMatchScoreLine(dto) || reason,
      courtId: dto.courtId,
      isChampionshipFinal: dto.isChampionshipFinal,
      forced: true,
      reason,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to force-end match";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
