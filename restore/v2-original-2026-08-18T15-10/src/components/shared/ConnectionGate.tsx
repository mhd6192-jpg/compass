"use client";

import { useEffect } from "react";
import { useCompassStore } from "@/store/useCompassStore";

export default function ConnectionGate({ children }: { children: React.ReactNode }) {
  const connect = useCompassStore((s) => s.connect);
  const snapshot = useCompassStore((s) => s.snapshot);

  useEffect(() => {
    connect();
  }, [connect]);

  if (!snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-court-bg">
        <div className="flex flex-col items-center gap-3 text-white/60">
          <div className="w-10 h-10 border-2 border-white/20 border-t-gold rounded-full animate-spin" />
          <p className="font-display tracking-wide uppercase text-sm">Connecting to Compass Draw…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
