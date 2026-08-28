import type { Metadata } from "next";
import "./v2.css";

export const metadata: Metadata = {
  title: "Compass v2 — Court Screens",
  description: "Per-court scoreboards, coach consoles and the awards presentation",
};

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
