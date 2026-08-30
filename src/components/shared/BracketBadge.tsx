import { BracketCode } from "@/lib/types";
import { BRACKET_STYLE } from "@/lib/bracketStyle";

export default function BracketBadge({
  bracket,
  roundName,
  size = "md",
}: {
  bracket: BracketCode;
  roundName?: string;
  size?: "sm" | "md" | "lg";
}) {
  const style = BRACKET_STYLE[bracket];
  const sizeClasses = size === "sm" ? "text-[10px] px-2 py-0.5" : size === "lg" ? "text-sm px-3 py-1.5" : "text-xs px-2.5 py-1";
  // An americano has only one "bracket", so the code carries no information —
  // "AM · Round 3" is just "Round 3" with noise in front of it.
  const showCode = bracket !== "AM";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${style.border} ${style.bg} ${style.text} font-display uppercase tracking-wide font-semibold whitespace-nowrap ${sizeClasses}`}
    >
      {showCode && bracket}
      {roundName ? (
        <span className={showCode ? "opacity-70 font-normal normal-case" : "font-normal normal-case"}>
          {showCode ? "· " : ""}
          {roundName}
        </span>
      ) : null}
    </span>
  );
}
