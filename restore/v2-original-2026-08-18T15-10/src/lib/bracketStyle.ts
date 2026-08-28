import { BracketCode } from "./types";

interface BracketStyle {
  text: string;
  bg: string;
  border: string;
  ring: string;
  solidBg: string;
  glow: string;
}

// Literal class strings (not template-built) so Tailwind's content scanner picks them all up.
export const BRACKET_STYLE: Record<BracketCode, BracketStyle> = {
  E: { text: "text-east", bg: "bg-east/15", border: "border-east", ring: "ring-east", solidBg: "bg-east", glow: "shadow-[0_0_36px_rgba(201,217,53,0.5)]" },
  W: { text: "text-west", bg: "bg-west/15", border: "border-west", ring: "ring-west", solidBg: "bg-west", glow: "shadow-[0_0_36px_rgba(59,130,246,0.55)]" },
  N: { text: "text-north", bg: "bg-north/15", border: "border-north", ring: "ring-north", solidBg: "bg-north", glow: "shadow-[0_0_36px_rgba(34,197,94,0.55)]" },
  S: { text: "text-south", bg: "bg-south/15", border: "border-south", ring: "ring-south", solidBg: "bg-south", glow: "shadow-[0_0_36px_rgba(245,158,11,0.55)]" },
  NE: { text: "text-ne", bg: "bg-ne/15", border: "border-ne", ring: "ring-ne", solidBg: "bg-ne", glow: "shadow-[0_0_36px_rgba(168,85,247,0.55)]" },
  SE: { text: "text-se", bg: "bg-se/15", border: "border-se", ring: "ring-se", solidBg: "bg-se", glow: "shadow-[0_0_36px_rgba(236,72,153,0.55)]" },
  NW: { text: "text-nw", bg: "bg-nw/15", border: "border-nw", ring: "ring-nw", solidBg: "bg-nw", glow: "shadow-[0_0_36px_rgba(6,182,212,0.55)]" },
  SW: { text: "text-sw", bg: "bg-sw/15", border: "border-sw", ring: "ring-sw", solidBg: "bg-sw", glow: "shadow-[0_0_36px_rgba(234,179,8,0.55)]" },
  RR: { text: "text-gold", bg: "bg-gold/15", border: "border-gold", ring: "ring-gold", solidBg: "bg-gold", glow: "shadow-[0_0_36px_rgba(212,175,55,0.5)]" },
};
