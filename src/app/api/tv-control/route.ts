import { NextResponse } from "next/server";
import { checkPin } from "@/lib/rateLimit";
import { getTvControl, setTvControl, TvMode } from "@/lib/tvControl";
import { getIO, EVENTS } from "@/lib/socket";

export async function GET() {
  return NextResponse.json(getTvControl());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const auth = await checkPin(req, "coach", body.pin);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const mode: TvMode | undefined = body.mode === "auto" || body.mode === "pinned" ? body.mode : undefined;
    const sceneId: string | undefined = typeof body.sceneId === "string" ? body.sceneId : undefined;
    const updated = setTvControl({ mode, sceneId });
    getIO()?.emit(EVENTS.TV_CONTROL, updated);
    return NextResponse.json({ ok: true, control: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update TV control";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
