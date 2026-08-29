"use client";

import { motion } from "framer-motion";
import { MatchDTO, isPointsRace, matchFormatLabel } from "@/lib/types";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import { ClubMark } from "@/components/shared/ClubLogo";
import { useScoreBeat } from "./useScoreBeat";
import { serveInfo } from "@/lib/scoring/serve";
import { ServeBadge, ServeHandover, useServeHandover } from "./ServeIndicator";

/** TV type sizes: scale with the screen, but never collapse on a laptop preview. */
const NAME_SIZE = "clamp(2.2rem, 6.4vw, 7.5rem)";
const POINT_SIZE = "clamp(3rem, 10.5vw, 12rem)";
const SET_SIZE = "clamp(1.6rem, 4.4vw, 5rem)";
const RACE_SIZE = "clamp(4rem, 16vw, 18rem)";

function SideRow({
  match,
  slot,
  leading,
  race,
  serve,
}: {
  match: MatchDTO;
  slot: 1 | 2;
  leading: boolean;
  race: boolean;
  serve: ReturnType<typeof serveInfo>;
}) {
  const i = slot - 1;
  const st = match.state;
  const player = slot === 1 ? match.player1 : match.player2;
  const style = BRACKET_STYLE[match.bracket];

  const setCells = st.completedSets.map((s, idx) => ({ key: `s${idx}`, value: s.games[i], live: false }));
  if (st.currentSet) setCells.push({ key: "live", value: st.currentSet.games[i], live: true });
  const points = st.currentGame ? st.currentGame.display[i] : null;

  if (race) {
    // No games, no sets — one number, as big as the screen allows.
    return (
      <div className="flex-1 min-h-0 flex items-center gap-[3vw] px-[3vw] relative">
        {leading && <span className={`absolute left-0 top-[12%] bottom-[12%] w-[0.6vw] rounded-r-full ${style.solidBg}`} />}
        <p
          className={`flex-1 min-w-0 truncate font-display uppercase font-bold tracking-tight ${leading ? "text-gold" : "text-white"}`}
          style={{ fontSize: NAME_SIZE, lineHeight: 1 }}
        >
          {player?.name ?? "TBD"}
        </p>
        <ServeBadge serve={serve} slot={slot} size="clamp(0.7rem, 1.4vw, 1.5rem)" ballSize={30} />
        <motion.span
          key={`race-${slot}-${points}`}
          initial={{ scale: 0.55, opacity: 0.2 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.55, duration: 0.45 }}
          className={`v2-digits font-display font-bold ${leading ? "text-gold" : "text-white/85"}`}
          style={{ fontSize: RACE_SIZE, lineHeight: 0.9 }}
        >
          {points ?? "0"}
        </motion.span>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex items-center gap-[2vw] px-[3vw] relative">
      {leading && <span className={`absolute left-0 top-[12%] bottom-[12%] w-[0.6vw] rounded-r-full ${style.solidBg}`} />}

      <p
        className={`flex-1 min-w-0 truncate font-display uppercase font-bold tracking-tight ${leading ? "text-gold" : "text-white"}`}
        style={{ fontSize: NAME_SIZE, lineHeight: 1 }}
      >
        {player?.name ?? "TBD"}
      </p>

      <ServeBadge serve={serve} slot={slot} showPips={false} ballSize={20} />

      {/* sets won — the number that actually decides the match, so it gets a chip of its own */}
      <span
        className="v2-digits font-display font-bold text-white/90 rounded-xl bg-white/[0.06] border border-white/10 text-center"
        style={{ fontSize: SET_SIZE, lineHeight: 1, padding: "0.18em 0.4em", minWidth: "1.7em" }}
      >
        {st.setsWon[i]}
      </span>

      <div className="flex items-center gap-[0.9vw] shrink-0">
        {setCells.map((c) => (
          <span
            key={c.key}
            className={`v2-digits font-display text-center ${c.live ? "text-white" : "text-white/45"}`}
            style={{ fontSize: SET_SIZE, lineHeight: 1, minWidth: "1.1em" }}
          >
            {c.value}
          </span>
        ))}
      </div>

      {points !== null && (
        <motion.span
          key={`pt-${slot}-${points}-${st.totalPoints}`}
          initial={{ scale: 0.5, opacity: 0.25 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.6, duration: 0.4 }}
          className="v2-digits font-display font-bold text-pine-deep bg-gold rounded-2xl text-center shrink-0"
          style={{ fontSize: POINT_SIZE, lineHeight: 1, padding: "0.06em 0.16em", minWidth: "1.55em" }}
        >
          {points}
        </motion.span>
      )}
    </div>
  );
}

/**
 * The full-screen scoreboard a court's TV becomes the moment its coach puts the
 * match on air. Nothing else is on screen: no standings, no ticker, no other
 * court — from the far side of the court this has to read in under a second.
 */
export default function Scoreboard({
  courtLabel,
  match,
  nextMatch,
  bestOfSets,
  tiebreakMode,
}: {
  courtLabel: string;
  match: MatchDTO;
  nextMatch: MatchDTO | null;
  bestOfSets: number;
  tiebreakMode: string;
}) {
  const beat = useScoreBeat(match);
  const style = BRACKET_STYLE[match.bracket];
  const race = isPointsRace(tiebreakMode);
  const started = match.status === "in_progress";

  // Whose serve it is, and whether it has just changed hands.
  const serve = serveInfo(match.state);
  const handedTo = useServeHandover(serve, match.id);
  const handoverName = handedTo === 1 ? match.player1?.name : handedTo === 2 ? match.player2?.name : null;

  const [a, b] = match.state.setsWon;
  const [ga, gb] = match.state.currentSet?.games ?? [0, 0];
  const [pa, pb] = match.state.currentGame?.points ?? [0, 0];
  const lead1 = a > b || (a === b && (ga > gb || (ga === gb && pa > pb)));
  const lead2 = b > a || (a === b && (gb > ga || (ga === gb && pb > pa)));

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col relative bg-court-bg">
      {/* bracket-tinted wash so each draw owns a colour on the big screen */}
      <div className={`absolute inset-0 opacity-[0.07] ${style.solidBg}`} />
      <div className="absolute inset-0 v2-stage-light pointer-events-none" />

      {beat && (
        <motion.div
          key={beat.ts}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: beat.tier === "set" ? 2 : 1.3, times: [0, 0.12, 0.7, 1] }}
          className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
        >
          <div className={`absolute inset-0 ${style.solidBg} opacity-20`} />
          <motion.span
            initial={{ scale: 2.8, rotate: -7 }}
            animate={{ scale: 1, rotate: -7 }}
            transition={{ type: "spring", bounce: 0.45, duration: 0.55 }}
            className="font-display font-bold uppercase text-gold drop-shadow-[0_0_40px_rgba(201,217,53,0.9)]"
            style={{ fontSize: "clamp(4rem, 16vw, 18rem)" }}
          >
            {beat.tier === "set" ? "Set!" : "Game!"}
          </motion.span>
        </motion.div>
      )}

      <header className="relative shrink-0 flex items-center justify-between px-[3vw] py-[2vh] border-b border-white/10">
        <div className="flex items-baseline gap-[1.6vw] min-w-0">
          <h1
            className="font-display font-bold uppercase tracking-[0.08em] text-white"
            style={{ fontSize: "clamp(1.4rem, 3.4vw, 3.6rem)" }}
          >
            {courtLabel}
          </h1>
          <p
            className={`font-display uppercase tracking-[0.25em] truncate ${style.text}`}
            style={{ fontSize: "clamp(0.7rem, 1.5vw, 1.6rem)" }}
          >
            {match.roundName}
          </p>
        </div>

        <div className="flex items-center gap-[1.6vw] shrink-0">
          <p
            className="font-display uppercase tracking-[0.2em] text-white/40 hidden sm:block"
            style={{ fontSize: "clamp(0.6rem, 1.1vw, 1.1rem)" }}
          >
            {matchFormatLabel(bestOfSets, match.state.config)}
          </p>
          <span
            className={`flex items-center gap-[0.6vw] rounded-full border px-[1.2vw] py-[0.5vh] font-display font-bold uppercase tracking-[0.2em] ${
              started ? "border-live/50 bg-live/15 text-live" : "border-white/20 bg-white/5 text-white/60"
            }`}
            style={{ fontSize: "clamp(0.6rem, 1.2vw, 1.3rem)" }}
          >
            <span
              className={`rounded-full ${started ? "bg-live animate-pulse" : "bg-white/50"}`}
              style={{ width: "0.7em", height: "0.7em" }}
            />
            {started ? "Live" : "About to start"}
          </span>
        </div>
      </header>

      <main className="relative flex-1 min-h-0 flex flex-col justify-center">
        <SideRow match={match} slot={1} leading={lead1} race={race} serve={serve} />
        <div className="h-px bg-white/10 mx-[3vw]" />
        <SideRow match={match} slot={2} leading={lead2} race={race} serve={serve} />
      </main>

      {handoverName && <ServeHandover key={`serve-${handedTo}-${match.state.totalPoints}`} name={handoverName} />}

      <footer className="relative shrink-0 flex items-center justify-between gap-[2vw] px-[3vw] py-[1.6vh] border-t border-white/10">
        <p className="min-w-0 truncate" style={{ fontSize: "clamp(0.7rem, 1.5vw, 1.6rem)" }}>
          <span className="font-display uppercase tracking-[0.25em] text-gold/70 mr-[1vw]">Up next</span>
          <span className="text-white/55">
            {nextMatch ? `${nextMatch.player1?.name ?? "TBD"} vs ${nextMatch.player2?.name ?? "TBD"}` : "—"}
          </span>
        </p>
        <span className="opacity-60 shrink-0">
          <ClubMark size={34} />
        </span>
      </footer>
    </div>
  );
}
