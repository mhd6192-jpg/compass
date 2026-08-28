"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MatchDTO } from "@/lib/types";
import { TV_SCENES, SCENE_DURATION_MS } from "@/lib/scenes";
import { useCompassStore } from "@/store/useCompassStore";
import CompassScene from "./scenes/CompassScene";
import FullDrawScene from "./scenes/FullDrawScene";
import DirectionsScene from "./scenes/DirectionsScene";
import LeaderboardScene from "./scenes/LeaderboardScene";

export default function SceneCarousel({
  matches,
  progress,
}: {
  matches: MatchDTO[];
  progress: { completed: number; total: number };
}) {
  const tvControl = useCompassStore((s) => s.tvControl);
  const [index, setIndex] = useState(0);

  const pinned = tvControl?.mode === "pinned";
  const pinnedIndex = pinned ? Math.max(0, TV_SCENES.findIndex((s) => s.id === tvControl?.sceneId)) : -1;

  // When the controller pins a scene, jump to it immediately.
  const lastRevRef = useRef<number>(-1);
  useEffect(() => {
    if (!tvControl) return;
    if (tvControl.rev === lastRevRef.current) return;
    lastRevRef.current = tvControl.rev;
    if (tvControl.mode === "pinned") {
      const i = TV_SCENES.findIndex((s) => s.id === tvControl.sceneId);
      if (i >= 0) setIndex(i);
    }
  }, [tvControl]);

  // Auto-advance only when not pinned.
  useEffect(() => {
    if (pinned) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % TV_SCENES.length);
    }, SCENE_DURATION_MS);
    return () => clearInterval(timer);
  }, [pinned]);

  const activeIndex = pinned && pinnedIndex >= 0 ? pinnedIndex : index;
  const scene = TV_SCENES[activeIndex];

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="flex items-center justify-center gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          {TV_SCENES.map((s, i) => (
            <span
              key={s.id}
              className={`h-1 rounded-full transition-all duration-300 ${i === activeIndex ? "w-6 bg-gold" : "w-1.5 bg-white/15"}`}
            />
          ))}
        </div>
        <motion.span
          key={scene.id}
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          className="font-display uppercase tracking-[0.25em] text-[10px] text-white/40"
        >
          {scene.label}
        </motion.span>
        {pinned && <span className="text-[9px] uppercase tracking-widest text-gold/70 font-display">● held</span>}
      </div>
      {/* Plain key-remount (no AnimatePresence exit-tracking) — guarantees the new scene
          actually mounts instead of an exit animation potentially never resolving. */}
      <motion.div
        key={scene.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex-1 flex flex-col min-h-0"
      >
        {scene.id === "compass" && <CompassScene matches={matches} progress={progress} />}
        {scene.id === "fulldraw" && <FullDrawScene matches={matches} />}
        {scene.id === "directions" && <DirectionsScene matches={matches} />}
        {scene.id === "leaderboard" && <LeaderboardScene matches={matches} progress={progress} />}
      </motion.div>
    </div>
  );
}
