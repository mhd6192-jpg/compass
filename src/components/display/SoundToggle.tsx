"use client";

import { useSoundStore } from "@/store/useSoundStore";
import { primeAudio } from "@/lib/sound";

export default function SoundToggle() {
  const enabled = useSoundStore((s) => s.enabled);
  const setEnabled = useSoundStore((s) => s.setEnabled);

  return (
    <button
      onClick={() => {
        primeAudio();
        setEnabled(!enabled);
      }}
      aria-label={enabled ? "Mute sound effects" : "Enable sound effects"}
      title={enabled ? "Sound on" : "Sound off"}
      className={`shrink-0 rounded-full w-9 h-9 flex items-center justify-center border text-sm transition-colors ${
        enabled ? "border-gold text-gold bg-gold/10" : "border-court-line text-white/30"
      }`}
    >
      {enabled ? "🔊" : "🔇"}
    </button>
  );
}
