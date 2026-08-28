"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePinStore } from "@/store/usePinStore";
import ClubLogo from "./ClubLogo";

/**
 * Full-screen unlock gate for staff surfaces (scorer, control). Nothing behind
 * it renders until a valid PIN is entered, so a spectator who types the URL off
 * the TV just sees a lock screen. Once unlocked, the PIN is remembered on the
 * device (persisted) so coaches aren't re-prompted.
 */
/** Synchronous best-guess read of the persisted PIN, so the first render doesn't
 *  have to wait for zustand's async localStorage rehydration to know whether an
 *  already-unlocked coach even needs the "checking" flash. */
function readStoredPinSync(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem("compass-draw-pin");
    if (!raw) return "";
    return JSON.parse(raw)?.state?.pin ?? "";
  } catch {
    return "";
  }
}

export default function PinGate({ children, title = "Staff access" }: { children: React.ReactNode; title?: string }) {
  const pin = usePinStore((s) => s.pin);
  const setPin = usePinStore((s) => s.setPin);
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const initialPinRef = useRef<string | null>(null);
  if (initialPinRef.current === null) initialPinRef.current = readStoredPinSync();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(candidate: string): Promise<boolean> {
    try {
      const res = await fetch("/api/auth/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: candidate }),
      });
      const data = await res.json();
      return !!data.ok;
    } catch {
      return false;
    }
  }

  // `pin` from the store starts as "" and flips to its persisted value once
  // zustand's persist middleware finishes reading localStorage (async, shortly
  // after first render). Use our own synchronous read as the candidate until
  // then, so an already-unlocked coach doesn't see a locked-screen flash while
  // the store catches up; re-running whenever `pin` changes keeps it in sync
  // afterward (e.g. a PIN entered on another tab/page).
  useEffect(() => {
    const candidate = pin || initialPinRef.current || "";
    let cancelled = false;
    (async () => {
      if (candidate && (await check(candidate))) {
        if (!cancelled) setState("open");
      } else if (!cancelled) {
        setState((prev) => (prev === "open" ? prev : "locked"));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  async function submit() {
    setError(null);
    setBusy(true);
    const ok = await check(draft.trim());
    setBusy(false);
    if (ok) {
      setPin(draft.trim());
      setState("open");
    } else {
      setError("Incorrect PIN");
      setDraft("");
    }
  }

  if (state === "open") return <>{children}</>;

  if (state === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-court-bg">
        <div className="w-10 h-10 border-2 border-white/20 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-court-bg">
      <div className="w-full max-w-xs text-center">
        <div className="flex justify-center mb-6">
          <ClubLogo size={48} />
        </div>
        <div className="rounded-2xl border border-court-line bg-court-panel p-6">
          <p className="text-3xl mb-2">🔒</p>
          <h1 className="font-display text-xl uppercase mb-1">{title}</h1>
          <p className="text-white/50 text-sm mb-5">Enter the tournament PIN to continue.</p>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="PIN"
            inputMode="numeric"
            type="password"
            autoFocus
            className={`w-full text-center tracking-[0.5em] font-mono text-lg bg-court-panel2 border rounded-xl px-3 py-3 outline-none focus:ring-2 ring-gold/50 mb-3 ${
              error ? "border-live" : "border-court-line"
            }`}
          />
          {error && <p className="text-live text-xs mb-3">{error}</p>}
          <button
            onClick={submit}
            disabled={busy || draft.trim().length < 1}
            className="w-full rounded-xl bg-gold text-court-bg font-display uppercase font-bold py-3 disabled:opacity-40"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </div>
        <Link href="/bracket" className="inline-block mt-5 text-white/30 text-xs underline underline-offset-4">
          I just want to watch the bracket
        </Link>
      </div>
    </div>
  );
}
