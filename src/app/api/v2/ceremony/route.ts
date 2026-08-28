import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPin } from "@/lib/auth";
import { CeremonyAction, runCeremonyAction } from "@/lib/v2/server";

const ACTIONS: CeremonyAction[] = ["configure", "start", "next", "back", "reset", "sound"];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!(await verifyPin(body.pin))) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }
    if (!ACTIONS.includes(body.action)) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
    const expectedRev = Number.isInteger(body.expectedRev) ? body.expectedRev : undefined;
    const { ceremony, applied } = await runCeremonyAction(prisma, body.action, {
      places: body.places,
      soundOn: body.soundOn,
      expectedRev,
    });
    return NextResponse.json({ ok: true, ceremony, applied });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update the presentation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
