import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkPin } from "@/lib/rateLimit";
import { broadcastSnapshot } from "@/lib/broadcast";
import { addPlayer, refuseFieldChange, replacePlayer, withdrawPlayer } from "@/lib/bracket/field";
import { openNextRotatingRound } from "@/lib/bracket/rotatingRounds";

export const dynamic = "force-dynamic";

/**
 * Who is playing tonight, and what can still be done about it.
 *
 * Separate from `/api/state` on purpose: every screen polls that several times
 * a second, and this is read once, by one person, on the control page.
 */
export async function GET() {
  try {
    const cfg = await prisma.tournamentConfig.findUnique({ where: { id: "default" } });
    const players = await prisma.player.findMany({ orderBy: { seed: "asc" } });

    // How many matches each has actually played, so the organiser can see who
    // has had a night and who has barely been on.
    const counts = new Map<string, number>();
    if (players.length > 0) {
      const matches = await prisma.match.findMany({
        where: { status: "completed" },
        select: { player1Id: true, player2Id: true, player1PartnerId: true, player2PartnerId: true },
      });
      for (const m of matches) {
        for (const id of [m.player1Id, m.player2Id, m.player1PartnerId, m.player2PartnerId]) {
          if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
    }

    const byId = new Map(players.map((p) => [p.id, p]));
    return NextResponse.json({
      status: cfg?.status ?? "setup",
      format: cfg?.format ?? "compass",
      refusals: {
        replace: refuseFieldChange(cfg?.format, "replace"),
        withdraw: refuseFieldChange(cfg?.format, "withdraw"),
        add: refuseFieldChange(cfg?.format, "add"),
      },
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        seed: p.seed,
        played: counts.get(p.id) ?? 0,
        withdrawn: !!p.withdrawnAt,
        replacedBy: p.replacedById ? byId.get(p.replacedById)?.name ?? null : null,
      })),
    });
  } catch {
    return NextResponse.json({ status: "setup", format: "compass", refusals: {}, players: [] });
  }
}

/**
 * Change who is playing.
 *
 * The organiser PIN, not the coach one — this rewrites fixtures that have not
 * been played yet, which is the same class of thing as erasing a draw and not
 * something the eight people holding the scoring PIN should be able to do.
 *
 * All of it happens in one transaction, because a half-applied change is a draw
 * nobody can play: a player marked as gone whose remaining rounds still name
 * them is exactly the state this exists to prevent.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await checkPin(req, "organiser", body.pin);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const action = body.action;
    const result = await prisma.$transaction(async (tx) => {
      if (action === "replace") return replacePlayer(tx, String(body.playerId ?? ""), String(body.name ?? ""));
      if (action === "withdraw") return withdrawPlayer(tx, String(body.playerId ?? ""));
      if (action === "add") return addPlayer(tx, String(body.name ?? ""));
      throw new Error("Say whether somebody is joining, leaving, or taking another player's place.");
    });

    // A change made while every match happens to be finished would otherwise sit
    // there until the next point was scored, with no round on court to open it.
    await prisma.$transaction((tx) => openNextRotatingRound(tx));
    await broadcastSnapshot();

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not change the field" }, { status: 400 });
  }
}
