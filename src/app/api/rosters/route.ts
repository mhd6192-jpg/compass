import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkPin } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Saved entrant lists.
 *
 * Reading is open, like every other read in this app — the TVs have to show
 * names without logging in, so a roster leaks nothing the court screens do not.
 * Writing and deleting need the organiser PIN, which is kept outside the
 * tournament precisely so it still exists at the moment a list is being saved
 * for the next one.
 */
export async function GET() {
  try {
    const rows = await prisma.savedRoster.findMany({ orderBy: { updatedAt: "desc" } });
    return NextResponse.json({
      rosters: rows.map((r) => ({
        id: r.id,
        label: r.label,
        names: Array.isArray(r.names) ? (r.names as string[]) : [],
        format: r.format,
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch {
    // A database that has not had `prisma db push` run yet should degrade to
    // "no saved lists" rather than breaking the setup screen entirely.
    return NextResponse.json({ rosters: [] });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const auth = await checkPin(req, "organiser", body.pin);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const names = Array.isArray(body.names) ? body.names.map((n: unknown) => String(n).trim()).filter(Boolean) : [];

    if (label.length < 1) return NextResponse.json({ error: "Give the list a name" }, { status: 400 });
    if (label.length > 60) return NextResponse.json({ error: "That name is too long" }, { status: 400 });
    if (names.length < 2) return NextResponse.json({ error: "Enter at least two entrants before saving" }, { status: 400 });
    if (names.length > 64) return NextResponse.json({ error: "That is more entrants than any format takes" }, { status: 400 });

    // Saving under an existing name replaces it, so "save" is also "update".
    const saved = await prisma.savedRoster.upsert({
      where: { label },
      create: { label, names, format: typeof body.format === "string" ? body.format : null },
      update: { names, format: typeof body.format === "string" ? body.format : null },
    });
    return NextResponse.json({ ok: true, id: saved.id, label: saved.label });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save the list" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const auth = await checkPin(req, "organiser", url.searchParams.get("pin"));
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which list?" }, { status: 400 });
    await prisma.savedRoster.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not delete the list" }, { status: 400 });
  }
}
