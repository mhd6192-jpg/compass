"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { drain, getSnapshot, subscribe, type DrainHandlers } from "@/lib/v2/outbox";

/**
 * Keeps the point queue draining while the coach console is open.
 *
 * Retries on a short timer rather than trusting `navigator.onLine` alone — a
 * phone attached to a venue access point that has itself lost the internet
 * reports "online" perfectly happily, and that is the exact failure this is
 * meant to survive. The `online` event just makes recovery instant when it does
 * fire.
 */
const RETRY_MS = 2500;

export function useOutbox(handlers: DrainHandlers) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // The handlers object is rebuilt every render; keeping the latest in a ref
  // means the retry timer is installed once instead of restarting constantly.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const tick = () => void drain(latest.current);
    const timer = setInterval(tick, RETRY_MS);
    window.addEventListener("online", tick);
    tick();
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", tick);
    };
  }, []);

  return state;
}
