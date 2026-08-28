import { NextResponse } from "next/server";
import { verifyPin } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ok = await verifyPin(body.pin);
    return NextResponse.json({ ok });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
