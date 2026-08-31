import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkPin } from "@/lib/rateLimit";
import { nameKeyOf } from "@/lib/members";

export const dynamic = "force-dynamic";

/** One person: who they are, and every event they have finished. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const member = await prisma.clubMember.findUnique({
      where: { id: params.id },
      include: {
        results: {
          orderBy: { endedAt: "desc" },
          include: { event: { select: { id: true, label: true, formatName: true, entrants: true, tallyUnit: true } } },
        },
      },
    });
    if (!member) return NextResponse.json({ error: "No such player" }, { status: 404 });

    return NextResponse.json({
      member: { id: member.id, name: member.name },
      results: member.results.map((r) => ({
        eventId: r.eventId,
        label: r.event.label,
        formatName: r.event.formatName,
        entrants: r.event.entrants,
        tallyUnit: r.event.tallyUnit,
        playedAs: r.playedAs,
        rank: r.rank,
        played: r.played,
        won: r.won,
        lost: r.lost,
        pointsFor: r.pointsFor,
        pointsAgainst: r.pointsAgainst,
        endedAt: r.endedAt.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ error: "No such player" }, { status: 404 });
  }
}

/**
 * Rename someone.
 *
 * Organiser only: a name here is attached to every past result, and the key it
 * is matched on decides who future draws attach to. Changing it is a decision
 * about the club's records, not about tonight.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await checkPin(req, "organiser", body.pin);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!name) return NextResponse.json({ error: "A name is required." }, { status: 400 });

    const nameKey = nameKeyOf(name);
    const clash = await prisma.clubMember.findUnique({ where: { nameKey } });
    if (clash && clash.id !== params.id) {
      // Renaming onto somebody who already exists is a merge, and merging is
      // destructive enough to be asked for explicitly rather than inferred.
      return NextResponse.json(
        { error: `${clash.name} already exists. Merge them instead if they are the same person.` },
        { status: 409 }
      );
    }

    const member = await prisma.clubMember.update({ where: { id: params.id }, data: { name, nameKey } });
    return NextResponse.json({ ok: true, member: { id: member.id, name: member.name } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not rename" }, { status: 400 });
  }
}
