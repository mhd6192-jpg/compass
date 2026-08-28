"use client";

import { useEffect, useState } from "react";

/**
 * A clock that only starts after mount.
 *
 * Elapsed times can't be computed during render without the server and the
 * client disagreeing about "now", so this returns null until the browser has
 * taken over and the screens simply show a dash for that first frame.
 */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);

  return now;
}
