import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scorePoint } from "@/lib/bracket/routing";
import { getMatchDTO } from "@/lib/bracket/dto";
import { formatMatchScoreLine } from "@/lib/scoring/format";
import { checkPin } from "@/lib/rateLimit";
import { broadcastSnapshot } from "@/lib/broadcast";
import { ensureCourtLive } from "@/lib/v2/server";
import { getIO, EVENTS } from "@/lib/socket";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const auth = await checkPin(req, "coach", body.pin);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const slot = body.slot === 1 || body.slot === 2 ? body.slot : null;
    if (!slot) {
      return NextResponse.json({ error: "slot must be 1 or 2" }, { status: 400 });
    }

    const expectedSeq = Number.isInteger(body.expectedSeq) && body.expectedSeq > 0 ? body.expectedSeq : undefined;

    // The phone's own clock. Only intervals between two taps from the same
    // device are ever compared, so a device whose clock is simply set wrong
    // still yields correct gaps — but a wildly out-of-range value usually means
    // a broken clock rather than a real tap, and is dropped.
    const tapped = typeof body.tappedAt === "number" ? new Date(body.tappedAt) : null;
    const sane =
      tapped && Number.isFinite(tapped.getTime()) && Math.abs(Date.now() - tapped.getTime()) < 24 * 60 * 60 * 1000;

    const result = await scorePoint(prisma, params.id, slot, expectedSeq, sane ? tapped : undefined);

    // A replay changed nothing, so there is nothing to announce — firing the
    // celebration events again would replay GAME/SET on every TV.
    if (result.duplicate) {
      return NextResponse.json({ ok: true, duplicate: true, tier: result.tier, completed: result.completed });
    }

    // A point arriving is proof the match is being played, so the court screen
    // should be showing it — even if the coach's "go live" never made it.
    const match = await prisma.match.findUnique({ where: { id: params.id }, select: { courtId: true } });
    if (match?.courtId != null) await ensureCourtLive(prisma, match.courtId, params.id);

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
