import { NextResponse } from "next/server";
import { checkPin } from "@/lib/rateLimit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const auth = await checkPin(req, "coach", body.pin);
    const ok = auth.ok;
    return NextResponse.json({ ok });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
