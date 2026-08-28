"use client";

import { CompletedEvt } from "@/store/useCompassStore";
import { BRACKET_LABELS } from "@/lib/types";

function TickerItem({ evt }: { evt: CompletedEvt }) {
  const label = BRACKET_LABELS[evt.bracket as keyof typeof BRACKET_LABELS] ?? evt.bracket;
  return (
    <span className="inline-flex items-center gap-2 px-7 whitespace-nowrap">
      {evt.courtId && <span className="text-gold font-display font-bold uppercase">Court {evt.courtId}</span>}
      <span className="text-white/90">
        <span className="font-semibold">{evt.winnerName}</span> def. {evt.loserName}
      </span>
      <span className="text-white/70 font-mono text-sm">{evt.scoreLine}</span>
      <span className="text-white/60 uppercase text-xs tracking-wider">
        {label} {evt.roundName}
      </span>
      {evt.forced && <span className="text-live/80 text-xs uppercase">({evt.reason})</span>}
      <span className="text-gold/40 pl-4">◆</span>
    </span>
  );
}

export default function ResultsTicker({ events }: { events: CompletedEvt[] }) {
  const loopItems = [...events, ...events];

  return (
    <div className="h-12 flex items-stretch border-t-2 border-gold/50 bg-black/60">
      <div className="flex items-center px-5 bg-gold shrink-0">
        <span className="font-display font-bold uppercase tracking-widest text-pine-deep text-sm">Results</span>
      </div>
      <div className="flex-1 overflow-hidden">
        {events.length === 0 ? (
          <div className="h-full flex items-center px-6 text-white/55 text-sm font-display uppercase tracking-widest">
            Completed matches will appear here as they finish
          </div>
        ) : (
          <div className="flex items-center h-full animate-marquee w-max text-sm sm:text-base">
            {loopItems.map((evt, i) => (
              <TickerItem key={`${evt.key}-${i}`} evt={evt} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
