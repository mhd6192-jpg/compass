"use client";

import { useEffect, useState } from "react";
import { usePinStore } from "@/store/usePinStore";

export default function PinBar({ invalid, onDismissInvalid }: { invalid?: boolean; onDismissInvalid?: () => void }) {
  const pin = usePinStore((s) => s.pin);
  const setPin = usePinStore((s) => s.setPin);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(!pin);

  useEffect(() => {
    if (invalid) {
      setDraft("");
      setEditing(true);
    }
  }, [invalid]);

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(pin);
          setEditing(true);
        }}
        className="text-xs text-white/40 underline underline-offset-4 shrink-0"
      >
        PIN set ✓
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Coach PIN"
        inputMode="numeric"
        autoFocus
        className={`bg-court-panel2 border rounded-lg px-3 py-2 text-sm w-24 outline-none focus:ring-2 ring-gold/50 ${
          invalid ? "border-live" : "border-court-line"
        }`}
      />
      <button
        onClick={() => {
          setPin(draft.trim());
          setEditing(false);
          onDismissInvalid?.();
        }}
        className="rounded-lg bg-gold text-court-bg text-xs font-bold px-3 py-2 shrink-0"
      >
        Save
      </button>
    </div>
  );
}
