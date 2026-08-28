import type { Metadata } from "next";
import "./v3.css";

export const metadata: Metadata = {
  title: "Compass v3 — Court Screens",
  description: "Per-court scoreboards, coach consoles and the awards presentation",
};

export default function V3Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
