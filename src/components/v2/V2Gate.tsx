"use client";

import { useEffect } from "react";
import { useV2Store } from "@/store/useV2Store";
import FreshnessNotice from "@/components/shared/FreshnessNotice";
import ClubLogo from "@/components/shared/ClubLogo";

/**
 * Connects the v2 poll and refuses to render half-working screens.
 *
 * The v2 tables are additive, so an existing deployment will not have them
 * until `prisma db push` runs. Saying so plainly beats the alternative — court
 * stages that appear to save on a coach's phone and never reach the TV.
 */
export default function V2Gate({ children }: { children: React.ReactNode }) {
  const connect = useV2Store((s) => s.connect);
  const snapshot = useV2Store((s) => s.snapshot);
  const lastSyncAt = useV2Store((s) => s.lastSyncAt);

  useEffect(() => {
    connect();
  }, [connect]);

  if (!snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-court-bg">
        <div className="flex flex-col items-center gap-4 text-white/60">
          <div className="w-12 h-12 border-2 border-white/15 border-t-gold rounded-full animate-spin" />
          <p className="font-display tracking-[0.3em] uppercase text-sm">Connecting…</p>
        </div>
      </div>
    );
  }

  if (!snapshot.v2.ready) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div className="max-w-xl flex flex-col items-center gap-5">
          <ClubLogo size={52} />
          <h1 className="font-display uppercase text-2xl sm:text-3xl">Compass v2 is not set up on this database yet</h1>
          <p className="text-white/60">
            The v2 court screens store their state in two new tables. Create them once, then reload this page:
          </p>
          <code className="rounded-xl border border-court-line bg-court-panel px-5 py-3 font-mono text-gold text-sm">
            npx prisma db push
          </code>
          <p className="text-white/35 text-xs">
            Nothing in the existing tournament is touched — the v1 display, scorer and control pages keep working either way.
          </p>
        </div>
      </div>
    );
  }

  // Rendered here rather than on each screen, so a screen cannot be built
  // without it — a court display that silently stops updating is the one
  // failure nobody in the venue can see for themselves.
  return (
    <>
      {children}
      <FreshnessNotice lastSyncAt={lastSyncAt} />
    </>
  );
}
