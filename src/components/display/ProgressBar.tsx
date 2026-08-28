"use client";

import { motion } from "framer-motion";

export default function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 w-full max-w-xs">
      <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full bg-gold rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      </div>
      <span className="text-white/50 text-xs font-mono shrink-0">
        {completed}/{total}
      </span>
    </div>
  );
}
