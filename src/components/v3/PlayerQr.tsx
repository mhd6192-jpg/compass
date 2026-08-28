"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

/**
 * How players find their own card.
 *
 * The origin has to be read at runtime — the venue reaches this over whatever
 * address the TV happens to be on (a Vercel URL, a laptop on the local
 * network), and a hardcoded link would send everyone somewhere unreachable.
 */
export default function PlayerQr({ size = 96 }: { size?: number }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}/v3/player`);
  }, []);

  if (!url) return null;

  return (
    <div className="flex items-center gap-[1vw]">
      <div className="bg-white rounded-xl p-[0.5vw] shrink-0">
        <QRCodeSVG value={url} size={size} bgColor="#ffffff" fgColor="#05070d" />
      </div>
      <div className="min-w-0">
        <p
          className="font-display uppercase tracking-[0.25em] text-gold"
          style={{ fontSize: "clamp(0.5rem, 0.95vw, 1rem)" }}
        >
          Players
        </p>
        <p className="font-display uppercase text-white/80" style={{ fontSize: "clamp(0.6rem, 1.15vw, 1.2rem)" }}>
          Scan for your court
        </p>
        <p className="text-white/30 truncate" style={{ fontSize: "clamp(0.45rem, 0.8vw, 0.85rem)" }}>
          {url.replace(/^https?:\/\//, "")}
        </p>
      </div>
    </div>
  );
}
