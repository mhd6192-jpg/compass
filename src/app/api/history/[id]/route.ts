import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyOrganiser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const row = await prisma.archivedTournament.findUnique({ where: { id: params.id } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      event: { ...row, startedAt: row.startedAt?.toISOString() ?? null, endedAt: row.endedAt.toISOString() },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    // Past events are the one thing here that cannot be recreated.
    if (!(await verifyOrganiser(new URL(req.url).searchParams.get("pin")))) {
      return NextResponse.json({ error: "The organiser PIN is needed to delete a past event." }, { status: 401 });
    }
    await prisma.archivedTournament.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not delete" }, { status: 400 });
  }
}
