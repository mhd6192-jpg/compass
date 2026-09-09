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

    // `player1Id` is the FIRST member of a side, not the side. In a
    // rotating-partners format the screen shows that side as "Ana & Ben", so a
    // name sent from a screen that read it there lands on Ana alone — and the
    // other two people on court have no field at all. Measured before this
    // guard: opening the editor on an americano match and pressing Save without
    // typing anything renamed Ana to "Ana & Hana" and Ben to "Ben & Gus", after
    // which a later round read "Ana & Hana & Ben & Gus vs Eve & Finn", and the
    // corrupted name went on into the standings, the archive and the club's
    // member history.
    //
    // There is no correct thing to do with the request, so it is refused rather
    // than guessed at. Renaming somebody in a rotating draw has a proper home:
    // "Who's playing" in the control room, which works on the person.
    if (match.player1PartnerId || match.player2PartnerId) {
      return NextResponse.json(
        {
          error:
            "This match is played by four individuals, so a name typed here would be stored against the wrong person. Rename them under “Who’s playing” in the control room.",
        },
        { status: 400 }
      );
    }

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
