"use client";

import { motion } from "framer-motion";

/**
 * The cup. Drawn rather than an emoji so it can be the size of a person on a
 * TV without going soft, and so the gold matches the club's lime-gold rather
 * than whatever the platform emoji font decides.
 */
export default function Trophy({ size = 220, animated = true }: { size?: number; animated?: boolean }) {
  const body = (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id="v2-cup-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F2FF6B" />
          <stop offset="42%" stopColor="#C9D935" />
          <stop offset="100%" stopColor="#8A9A16" />
        </linearGradient>
        <linearGradient id="v2-cup-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* handles */}
      <path
        d="M30 26 C12 26 10 46 24 54 C29 57 33 57 36 56"
        fill="none"
        stroke="url(#v2-cup-gold)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M90 26 C108 26 110 46 96 54 C91 57 87 57 84 56"
        fill="none"
        stroke="url(#v2-cup-gold)"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* bowl */}
      <path d="M30 20 H90 V46 C90 66 78 78 60 78 C42 78 30 66 30 46 Z" fill="url(#v2-cup-gold)" />
      {/* rim */}
      <rect x="26" y="15" width="68" height="9" rx="4.5" fill="url(#v2-cup-gold)" />
      {/* stem + base */}
      <rect x="55" y="78" width="10" height="14" fill="url(#v2-cup-gold)" />
      <path d="M40 92 H80 L84 104 H36 Z" fill="url(#v2-cup-gold)" />
      <rect x="30" y="104" width="60" height="9" rx="4" fill="url(#v2-cup-gold)" />

      {/* engraved star */}
      <path
        d="M60 34 L63.8 43.2 L73.6 44 L66.1 50.4 L68.4 60 L60 54.8 L51.6 60 L53.9 50.4 L46.4 44 L56.2 43.2 Z"
        fill="#0C3B20"
        opacity="0.45"
      />

      {/* travelling shine */}
      <motion.rect
        x="-40"
        y="10"
        width="26"
        height="105"
        fill="url(#v2-cup-shine)"
        animate={{ x: [-40, 130] }}
        transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1.6, ease: "easeInOut" }}
        style={{ mixBlendMode: "screen" }}
      />
    </svg>
  );

  if (!animated) return body;

  return (
    <motion.div
      initial={{ scale: 0.2, opacity: 0, rotate: -22 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", bounce: 0.45, duration: 1.1 }}
      className="drop-shadow-[0_0_60px_rgba(201,217,53,0.55)]"
    >
      <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}>
        {body}
      </motion.div>
    </motion.div>
  );
}
