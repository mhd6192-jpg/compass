"use client";

import { MatchDTO } from "@/lib/types";
import ButterflyDraw from "@/components/display/ButterflyDraw";

export default function FullDrawScene({ matches }: { matches: MatchDTO[] }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-0 gap-1.5">
      <p className="font-display uppercase tracking-[0.3em] text-xs">
        <span className="text-west">West</span>
        <span className="text-white/30"> ← losers · Full Draw · winners → </span>
        <span className="text-east">East</span>
      </p>
      <div className="overflow-hidden max-w-full">
        <ButterflyDraw matches={matches} rowH={40} />
      </div>
    </div>
  );
}
