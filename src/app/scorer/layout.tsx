"use client";

import PinGate from "@/components/shared/PinGate";

export default function ScorerLayout({ children }: { children: React.ReactNode }) {
  return <PinGate title="Coach scorer">{children}</PinGate>;
}
