"use client";

import PinGate from "@/components/shared/PinGate";

export default function ControlLayout({ children }: { children: React.ReactNode }) {
  return <PinGate title="TV control">{children}</PinGate>;
}
