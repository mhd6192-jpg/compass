"use client";

import { useEffect, useState } from "react";
import PlayerQr from "./PlayerQr";
import { ClubMark } from "@/components/shared/ClubLogo";
import { buildSpotlights } from "@/lib/v3/stats";
import type { MatchDTO } from "@/lib/types";

/** How long each card holds. Long enough to read from the far side of a court. */
const HOLD_MS = 9000;

/**
 * The panel that gives a court screen something to say between matches.
 *
 * A screen showing the same fixture for forty minutes stops being looked at,
 * and once players stop looking they stop noticing when they are called. So the
 * panel cycles: a couple of facts from the day's play, then the QR that gets
 * them their own card, then the club's mark.
 *
 * The QR and the club slide are always present, which matters at the start of
 * the day — before any result exists there are no statistics to show, and an
 * empty box would be worse than no box.
 */
export default function IdleSpotlight({ matches }: { matches: MatchDTO[] }) {
  const stats = buildSpotlights(matches);
  // Fixed slides live at the end so the day's news leads.
  const slides = [...stats.map((s) => ({ kind: "stat" as const, data: s })), { kind: "qr" as const }, { kind: "club" as const }];

  const [index, setIndex] = useState(0);

  // Re-entering the range after a result lands must not leave the index dangling
  // past the end of the list.
  const count = slides.length;
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), HOLD_MS);
    return () => clearInterval(t);
  }, [count]);

  const slide = slides[Math.min(index, count - 1)];

  return (
    <div className="rounded-2xl border border-court-line bg-court-panel px-[1.6vw] py-[1.8vh] flex flex-col overflow-hidden relative">
      <div
        key={slide.kind === "stat" ? slide.data.key : slide.kind}
        className="v3-fade-up flex-1 min-h-0 flex flex-col justify-center"
      >
          {slide.kind === "stat" && (
            <>
              <p style={{ fontSize: "clamp(1.4rem, 3vw, 3rem)", lineHeight: 1 }}>{slide.data.icon}</p>
              <p
                className="font-display uppercase tracking-[0.28em] text-gold mt-[1vh]"
                style={{ fontSize: "clamp(0.5rem, 0.95vw, 1rem)" }}
              >
                {slide.data.eyebrow}
              </p>
              <p
                className="font-display font-bold uppercase text-white leading-tight break-words mt-[0.6vh]"
                style={{ fontSize: "clamp(1.1rem, 2.6vw, 2.8rem)" }}
              >
                {slide.data.headline}
              </p>
              <p className="text-white/45 mt-[0.8vh] break-words" style={{ fontSize: "clamp(0.6rem, 1.1vw, 1.15rem)" }}>
                {slide.data.detail}
              </p>
            </>
          )}

          {slide.kind === "qr" && <PlayerQr size={96} />}

          {slide.kind === "club" && (
            <div className="flex flex-col items-center text-center gap-[1.2vh]">
              <span className="v3-breathe opacity-80">
                <ClubMark size={54} />
              </span>
              <p
                className="font-display uppercase tracking-[0.3em] text-white/70"
                style={{ fontSize: "clamp(0.6rem, 1.15vw, 1.2rem)" }}
              >
                Alhayat Tennis Center
              </p>
              <p className="text-white/30" style={{ fontSize: "clamp(0.5rem, 0.9vw, 0.95rem)" }}>
                Thanks for playing today
              </p>
            </div>
          )}
      </div>

      {/* progress pips, so the screen reads as alive rather than stuck */}
      {count > 1 && (
        <div className="shrink-0 flex items-center gap-[0.4em] pt-[1.2vh]">
          {slides.map((s, i) => (
            <span
              key={s.kind === "stat" ? s.data.key : s.kind}
              className={`h-[0.35vh] flex-1 rounded-full ${i === index ? "bg-gold" : "bg-white/15"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
