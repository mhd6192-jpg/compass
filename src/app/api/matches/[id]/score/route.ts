import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyManualScore } from "@/lib/bracket/routing";
import { getMatchDTO } from "@/lib/bracket/dto";
import { formatMatchScoreLine } from "@/lib/scoring/format";
import { checkPin } from "@/lib/rateLimit";
import { broadcastSnapshot } from "@/lib/broadcast";
import { getIO, EVENTS } from "@/lib/socket";
import { SetInput } from "@/lib/scoring/synth";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const auth = await checkPin(req, "coach", body.pin);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const finalize = body.finalize === true;
    const completedSets: SetInput[] = Array.isArray(body.completedSets)
      ? body.completedSets.map((s: unknown) => ({ a: Number((s as SetInput).a), b: Number((s as SetInput).b) }))
      : [];
    const currentSetGames =
      Array.isArray(body.currentSetGames) && body.currentSetGames.length === 2
        ? ([Number(body.currentSetGames[0]), Number(body.currentSetGames[1])] as [number, number])
        : undefined;

    if (completedSets.length === 0 && !currentSetGames) {
      return NextResponse.json({ error: "Enter at least one set score" }, { status: 400 });
    }

    const result = await applyManualScore(prisma, params.id, { completedSets, currentSetGames }, finalize);
    await broadcastSnapshot();

    const io = getIO();
    if (result.completed) {
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
        scoreLine: formatMatchScoreLine(dto),
        courtId: dto.courtId,
        isChampionshipFinal: dto.isChampionshipFinal,
      });
    }

    return NextResponse.json({ ok: true, completed: result.completed });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save score";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
