import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkPin } from "@/lib/rateLimit";
import { mergeMembers } from "@/lib/members";

/**
 * Folds one person's record into another's.
 *
 * Entrants are matched to people by name, so a typo one week makes two people
 * out of one and there is no other way back. Organiser only, and it cannot be
 * undone — the losing record is deleted, not hidden.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await checkPin(req, "organiser", body.pin);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const keepId = typeof body.keepId === "string" ? body.keepId : "";
    const dropId = typeof body.dropId === "string" ? body.dropId : "";
    if (!keepId || !dropId) return NextResponse.json({ error: "Pick two players to merge." }, { status: 400 });

    const moved = await mergeMembers(prisma, keepId, dropId);
    return NextResponse.json({ ok: true, moved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not merge" }, { status: 400 });
  }
}
