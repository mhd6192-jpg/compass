import { NextResponse } from "next/server";
import { checkPin } from "@/lib/rateLimit";

/**
 * Does this PIN work? Used by the lock screen before letting a coach through.
 *
 * Reports a lockout distinctly from a wrong PIN. They are not the same thing to
 * the person holding the phone: one means "check what you typed", the other
 * means "wait a moment" — and a coach told their correct PIN is wrong will
 * conclude it was changed and go looking for the organiser mid-match.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const auth = await checkPin(req, "coach", body.pin);
    if (auth.ok) return NextResponse.json({ ok: true });
    return NextResponse.json({
      ok: false,
      lockedOut: auth.status === 429,
      error: auth.error,
      retryAfter: auth.retryAfter,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
