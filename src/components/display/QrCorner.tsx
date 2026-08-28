"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function QrCorner() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(`${window.location.origin}/bracket`);
  }, []);

  if (!url) return null;

  return (
    <div className="flex flex-col items-center gap-1 bg-white rounded-xl p-2">
      <QRCodeSVG value={url} size={72} bgColor="#ffffff" fgColor="#05070d" />
      <span className="text-court-bg text-[9px] font-bold uppercase tracking-wide">Live Bracket</span>
    </div>
  );
}
