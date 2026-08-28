"use client";

import { useEffect, useState } from "react";
import { useCompassStore } from "@/store/useCompassStore";
import { AnimationTier } from "@/lib/types";

export interface TierEvent {
  tier: AnimationTier;
  ts: number;
}

/** Latest point-tier event for a specific match, so a court card can fire its own point/game/set flash. */
export function useMatchTierEvent(matchId?: string): TierEvent | null {
  const lastPointEvent = useCompassStore((s) => s.lastPointEvent);
  const [event, setEvent] = useState<TierEvent | null>(null);

  useEffect(() => {
    if (lastPointEvent && matchId && lastPointEvent.matchId === matchId) {
      setEvent({ tier: lastPointEvent.tier, ts: lastPointEvent.ts });
    }
  }, [lastPointEvent, matchId]);

  return event;
}
