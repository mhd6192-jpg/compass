"use client";

import { MatchDTO } from "@/lib/types";
import { BracketMatchNode } from "./BracketTree";

/**
 * The classic printed compass-draw "butterfly": East Round of 16 as the central
 * spine, winners fanning right (E QF -> SF -> Final), losers fanning left into
 * West (R1 -> SF -> Final). Built on a fixed-height CSS grid so the connector
 * elbows (drawn in dedicated 20px columns) line up exactly with node centers:
 * an elbow spanning a pair's rows meets the two children at 25%/75% of its
 * height and the parent at 50%.
 */

const LINE = "bg-white/25";

function Elbow({ dir, col, row, span }: { dir: "right" | "left"; col: number; row: number; span: number }) {
  return (
    <div style={{ gridColumn: col, gridRow: `${row} / span ${span}` }} className="relative">
      {dir === "right" ? (
        <>
          <span className={`absolute left-0 right-1/2 h-px ${LINE}`} style={{ top: "25%" }} />
          <span className={`absolute left-0 right-1/2 h-px ${LINE}`} style={{ top: "75%" }} />
          <span className={`absolute w-px ${LINE}`} style={{ left: "50%", top: "25%", bottom: "25%" }} />
          <span className={`absolute left-1/2 right-0 h-px ${LINE}`} style={{ top: "50%" }} />
        </>
      ) : (
        <>
          <span className={`absolute right-0 left-1/2 h-px ${LINE}`} style={{ top: "25%" }} />
          <span className={`absolute right-0 left-1/2 h-px ${LINE}`} style={{ top: "75%" }} />
          <span className={`absolute w-px ${LINE}`} style={{ right: "50%", top: "25%", bottom: "25%" }} />
          <span className={`absolute right-1/2 left-0 h-px ${LINE}`} style={{ top: "50%" }} />
        </>
      )}
    </div>
  );
}

function Cell({ col, row, span, children }: { col: number; row: number; span: number; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: col, gridRow: `${row} / span ${span}` }} className="flex items-center justify-center">
      {children}
    </div>
  );
}

function championOf(m: MatchDTO | undefined): string | null {
  if (!m || m.status !== "completed" || !m.winnerId) return null;
  return (m.winnerId === m.player1?.id ? m.player1?.name : m.player2?.name) ?? null;
}

function FinalBlock({
  match,
  label,
  labelClass,
  championLabel,
}: {
  match: MatchDTO | undefined;
  label: string;
  labelClass: string;
  championLabel: string;
}) {
  const champ = championOf(match);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <p className={`font-display font-bold uppercase tracking-widest text-base ${labelClass}`}>{label}</p>
      <BracketMatchNode match={match} size="sm" />
      {champ && (
        <div className="rounded-md border border-gold bg-gold/10 px-2 py-1 text-center">
          <p className="text-[8px] uppercase tracking-widest text-gold/70 font-display">{championLabel}</p>
          <p className="font-display font-bold uppercase text-gold text-xs whitespace-nowrap">🏆 {champ}</p>
        </div>
      )}
    </div>
  );
}

export default function ButterflyDraw({ matches, rowH = 44 }: { matches: MatchDTO[]; rowH?: number }) {
  const get = (bracket: string, round: number, pos: number) =>
    matches.find((m) => m.bracket === bracket && m.round === round && m.posIndex === pos);

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "auto 20px auto 20px auto 20px auto 20px auto 20px auto 20px auto",
        gridTemplateRows: `repeat(8, ${rowH}px)`,
      }}
    >
      {/* West side (losers fan left): Final | SF | R1 */}
      <Cell col={1} row={1} span={8}>
        <FinalBlock match={get("W", 3, 0)} label="West" labelClass="text-west" championLabel="West Champion" />
      </Cell>
      <Elbow dir="left" col={2} row={1} span={8} />
      {[0, 1].map((i) => (
        <Cell key={`wsf${i}`} col={3} row={4 * i + 1} span={4}>
          <BracketMatchNode match={get("W", 2, i)} size="sm" />
        </Cell>
      ))}
      {[0, 1].map((i) => (
        <Elbow key={`wsfe${i}`} dir="left" col={4} row={4 * i + 1} span={4} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Cell key={`wr1${i}`} col={5} row={2 * i + 1} span={2}>
          <BracketMatchNode match={get("W", 1, i)} size="sm" />
        </Cell>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Elbow key={`wr1e${i}`} dir="left" col={6} row={2 * i + 1} span={2} />
      ))}

      {/* Central spine: East Round of 16 */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <Cell key={`r16-${i}`} col={7} row={i + 1} span={1}>
          <BracketMatchNode match={get("E", 1, i)} size="sm" />
        </Cell>
      ))}

      {/* East side (winners fan right): QF | SF | Final */}
      {[0, 1, 2, 3].map((i) => (
        <Elbow key={`eqfe${i}`} dir="right" col={8} row={2 * i + 1} span={2} />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Cell key={`eqf${i}`} col={9} row={2 * i + 1} span={2}>
          <BracketMatchNode match={get("E", 2, i)} size="sm" />
        </Cell>
      ))}
      {[0, 1].map((i) => (
        <Elbow key={`esfe${i}`} dir="right" col={10} row={4 * i + 1} span={4} />
      ))}
      {[0, 1].map((i) => (
        <Cell key={`esf${i}`} col={11} row={4 * i + 1} span={4}>
          <BracketMatchNode match={get("E", 3, i)} size="sm" />
        </Cell>
      ))}
      <Elbow dir="right" col={12} row={1} span={8} />
      <Cell col={13} row={1} span={8}>
        <FinalBlock match={get("E", 4, 0)} label="East" labelClass="text-east" championLabel="Tournament Champion" />
      </Cell>
    </div>
  );
}
