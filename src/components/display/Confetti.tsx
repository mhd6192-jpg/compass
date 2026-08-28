"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";

interface Particle {
  id: number;
  left: number;
  color: string;
  width: number;
  height: number;
  delay: number;
  duration: number;
  rotate: number;
  drift: number;
}

const DEFAULT_COLORS = ["#ffd166", "#ff3b5c", "#3b82f6", "#22c55e", "#a855f7", "#ec4899", "#06b6d4"];

export default function Confetti({ count = 60, colors = DEFAULT_COLORS }: { count?: number; colors?: string[] }) {
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: colors[i % colors.length],
        width: 6 + Math.random() * 7,
        height: 10 + Math.random() * 10,
        delay: Math.random() * 0.7,
        duration: 2.2 + Math.random() * 1.8,
        rotate: Math.random() * 360 * (Math.random() < 0.5 ? 1 : -1),
        drift: (Math.random() - 0.5) * 240,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count]
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          initial={{ y: -40, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: "110vh", x: p.drift, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: 0,
            width: p.width,
            height: p.height,
            background: p.color,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}
