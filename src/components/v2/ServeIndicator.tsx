"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { type ServeInfo } from "@/lib/scoring/serve";

/** A tennis ball, drawn so it stays crisp at TV size. */
export function Ball({ size = 24, spin = false }: { size?: number; spin?: boolean }) {
  const svg = (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <circle cx="16" cy="16" r="15" fill="#D6E64C" />
      <circle cx="16" cy="16" r="15" fill="none" stroke="#8A9A16" strokeWidth="1.2" opacity="0.5" />
      {/* the two seams */}
      <path d="M3 8 C 11 13, 11 19, 3 24" fill="none" stroke="#F7FFC2" strokeWidth="2" strokeLinecap="round" />
      <path d="M29 8 C 21 13, 21 19, 29 24" fill="none" stroke="#F7FFC2" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="11" cy="10" rx="5" ry="3.4" fill="#ffffff" opacity="0.32" transform="rotate(-28 11 10)" />
    </svg>
  );
  if (!spin) return svg;
  return (
    <motion.span
      className="inline-flex"
      animate={{ rotate: 360 }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
    >
      {svg}
    </motion.span>
  );
}

/** One pip per serve in a turn, filled for the serves still to come. */
function ServePips({ left, total, size }: { left: number; total: number; size: string }) {
  return (
    <span className="inline-flex items-center gap-[0.28em]" style={{ fontSize: size }}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`rounded-full ${i < left ? "bg-gold" : "bg-white/20"}`}
          style={{ width: "0.42em", height: "0.42em" }}
        />
      ))}
    </span>
  );
}

/**
 * Sits beside the serving side's name so nobody has to count points back to
 * work out whose serve it is. The pips are the part that actually gets used:
 * they show at a glance how many serves are left before it changes hands, which
 * is the thing players ask about mid-rally.
 */
export function ServeBadge({
  serve,
  slot,
  size = "clamp(0.55rem, 1.1vw, 1.1rem)",
  ballSize = 22,
  showPips = true,
}: {
  serve: ServeInfo | null;
  slot: 1 | 2;
  size?: string;
  ballSize?: number;
  showPips?: boolean;
}) {
  if (!serve || serve.slot !== slot) return null;

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", bounce: 0.5, duration: 0.5 }}
      className="inline-flex items-center gap-[0.5em] rounded-full border border-gold/50 bg-gold/10 px-[0.7em] py-[0.32em] shrink-0"
      style={{ fontSize: size }}
    >
      <Ball size={ballSize} spin />
      <span className="font-display uppercase tracking-[0.22em] text-gold whitespace-nowrap">Serving</span>
      {showPips && <ServePips left={serve.servesLeft} total={serve.serveEvery} size={size} />}
    </motion.span>
  );
}

/**
 * Announces the change of serve, once, for a few seconds.
 *
 * Returns the side that has just taken over, or null. Deliberately silent on
 * the first sight of a match: opening a TV mid-match should not fire a handover
 * banner for a serve that changed ten minutes ago.
 */
export function useServeHandover(serve: ServeInfo | null, matchId: string | null): 1 | 2 | null {
  const [taken, setTaken] = useState<{ slot: 1 | 2; ts: number } | null>(null);
  const prev = useRef<{ matchId: string; slot: 1 | 2 } | null>(null);

  const slot = serve?.slot ?? null;

  useEffect(() => {
    if (!matchId || slot === null) {
      prev.current = null;
      return;
    }
    const before = prev.current;
    prev.current = { matchId, slot };
    if (!before || before.matchId !== matchId) return; // first sight — nothing changed hands
    if (before.slot !== slot) setTaken({ slot, ts: Date.now() });
  }, [matchId, slot]);

  useEffect(() => {
    if (!taken) return;
    const t = setTimeout(() => setTaken(null), 3200);
    return () => clearTimeout(t);
  }, [taken]);

  return taken?.slot ?? null;
}

/**
 * The handover itself: a gold rule draws itself across the screen, the ball
 * arrives, and the name of the side taking over rises under it. Sized to be
 * read from the far end of the court but placed low, so it never covers the
 * score it is announcing alongside.
 */
export function ServeHandover({ name }: { name: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-x-0 bottom-[12vh] z-30 flex flex-col items-center pointer-events-none"
    >
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -14 }}
        transition={{ type: "spring", bounce: 0.4, duration: 0.7 }}
        className="flex items-center gap-[1.6vw] rounded-full border border-gold/45 bg-court-panel/92 px-[2.6vw] py-[1.4vh] backdrop-blur-sm shadow-[0_0_60px_rgba(201,217,53,0.28)]"
      >
        {/* the ball travels in from the side that just lost the serve */}
        <motion.span
          initial={{ x: -70, rotate: -220, opacity: 0 }}
          animate={{ x: 0, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.35, duration: 0.85 }}
          className="inline-flex"
        >
          <Ball size={40} />
        </motion.span>

        <span className="flex flex-col leading-tight">
          <span
            className="font-display uppercase tracking-[0.42em] text-gold/80"
            style={{ fontSize: "clamp(0.5rem, 1vw, 1rem)" }}
          >
            Change of serve
          </span>
          <span
            className="font-display font-bold uppercase text-white truncate max-w-[52vw]"
            style={{ fontSize: "clamp(1rem, 2.6vw, 2.8rem)", lineHeight: 1.1 }}
          >
            {name}
          </span>
        </span>
      </motion.div>

      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: "26vw", opacity: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="h-[0.35vh] rounded-full bg-gradient-to-r from-transparent via-gold to-transparent mt-[1.4vh]"
      />
    </motion.div>
  );
}
