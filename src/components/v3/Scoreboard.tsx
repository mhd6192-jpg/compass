"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MatchDTO, isPointsRace, matchFormatLabel, raceTargetOf } from "@/lib/types";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import { ClubMark } from "@/components/shared/ClubLogo";
import { useScoreBeat } from "./useScoreBeat";
import { serveInfo } from "@/lib/scoring/serve";
import { pressureInfo } from "@/lib/scoring/pressure";
import { ServeBadge, ServeHandover, useServeHandover } from "./ServeIndicator";
import { useNow } from "./useNow";
import { formatDuration } from "@/lib/v3/venue";

/** TV type sizes: scale with the screen, but never collapse on a laptop preview. */
const NAME_SIZE = "clamp(2.2rem, 6.4vw, 7.5rem)";
const POINT_SIZE = "clamp(3rem, 10.5vw, 12rem)";
const SET_SIZE = "clamp(1.6rem, 4.4vw, 5rem)";
const RACE_SIZE = "clamp(4rem, 16vw, 18rem)";
/** Each half of a doubles pair, stacked. Smaller than a single name, far bigger than a truncated one. */
const PAIR_NAME_SIZE = "clamp(1.5rem, 4.2vw, 4.8rem)";


/**
 * An entrant's name, sized for the far side of a court.
 *
 * A short pair fits one line at full size, and one big line beats two smaller
 * ones every time — so it is left alone. Only a pair too long for the row gets
 * split across two lines, which is far better than the alternative of shrinking
 * it to nothing or clipping it mid-name. Measured against the real screen: at
 * 1920 wide a name of about sixteen characters is the point where the single
 * line runs out of room beside the score.
 */
const ONE_LINE_LIMIT = 16;
function EntrantName({
  name,
  leading,
  doubles,
}: {
  name: string;
  leading: boolean;
  doubles: boolean;
}) {
  const split = doubles ? name.split(/\s*[/&+]\s*/).map((x) => x.trim()).filter(Boolean) : [name];
  const parts = split.length === 2 && name.length > ONE_LINE_LIMIT ? split : [name];
  const tone = leading ? "text-gold" : "text-white";

  if (parts.length < 2) {
    return (
      <p
        className={`flex-1 min-w-0 truncate font-display uppercase font-bold tracking-tight ${tone}`}
        style={{ fontSize: NAME_SIZE, lineHeight: 1 }}
      >
        {parts[0] ?? name}
      </p>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      {parts.slice(0, 2).map((part, i) => (
        <p
          key={i}
          className={`truncate font-display uppercase font-bold tracking-tight ${tone}`}
          style={{ fontSize: PAIR_NAME_SIZE, lineHeight: 1.02 }}
        >
          {part}
        </p>
      ))}
    </div>
  );
}

function SideRow({
  match,
  slot,
  leading,
  race,
  serve,
  doubles,
}: {
  match: MatchDTO;
  slot: 1 | 2;
  leading: boolean;
  race: boolean;
  serve: ReturnType<typeof serveInfo>;
  doubles: boolean;
}) {
  const i = slot - 1;
  const st = match.state;
  const player = slot === 1 ? match.player1 : match.player2;
  const style = BRACKET_STYLE[match.bracket];

  const setCells = st.completedSets.map((s, idx) => ({ key: `s${idx}`, value: s.games[i], live: false }));
  if (st.currentSet) setCells.push({ key: "live", value: st.currentSet.games[i], live: true });
  const points = st.currentGame ? st.currentGame.display[i] : null;

  if (race) {
    // No games, no sets — one number, as big as the screen allows, and a track
    // under the row so how close the race is reads from the back of the hall.
    const target = raceTargetOf(st.config);
    const pts = st.currentGame?.points[i] ?? 0;
    const frac = Math.min(1, pts / target);
    return (
      <div className="flex-1 min-h-0 flex flex-col justify-center px-[3vw] relative">
        {leading && <span className={`absolute left-0 top-[12%] bottom-[12%] w-[0.6vw] rounded-r-full ${style.solidBg}`} />}
        <div className="flex items-center gap-[3vw] min-h-0">
          <EntrantName name={player?.name ?? "TBD"} leading={leading} doubles={doubles} />
          <ServeBadge serve={serve} slot={slot} size="clamp(0.7rem, 1.4vw, 1.5rem)" ballSize={30} />
          <span className="relative inline-flex shrink-0">
            {/* one soft pulse of light each time this side scores */}
            <motion.span
              key={`glow-${slot}-${pts}`}
              initial={{ opacity: 0.55, scale: 0.5 }}
              animate={{ opacity: 0, scale: 1.7 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="absolute inset-[-12%] rounded-full bg-gold/40 blur-2xl pointer-events-none"
            />
            <motion.span
              key={`race-${slot}-${points}`}
              initial={{ scale: 0.55, opacity: 0.2 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.55, duration: 0.45 }}
              className={`v3-digits font-display font-bold relative ${leading ? "text-gold" : "text-white/85"}`}
              style={{ fontSize: RACE_SIZE, lineHeight: 0.9 }}
            >
              {points ?? "0"}
            </motion.span>
          </span>
        </div>
        {/* Width set as a style, animated by CSS: a backgrounded TV tab pauses
            rAF-driven (framer) animations at their first frame, and a progress
            bar stuck on a stale width is misinformation. A CSS transition still
            lands on the correct final value even when the tab is hidden. */}
        <div className="shrink-0 h-[0.9vh] rounded-full bg-white/[0.07] overflow-hidden mt-[0.6vh] mb-[1.2vh]">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${leading ? "bg-gradient-to-r from-gold/40 to-gold" : "bg-white/25"}`}
            style={{ width: `${frac * 100}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex items-center gap-[2vw] px-[3vw] relative">
      {leading && <span className={`absolute left-0 top-[12%] bottom-[12%] w-[0.6vw] rounded-r-full ${style.solidBg}`} />}

      <EntrantName name={player?.name ?? "TBD"} leading={leading} doubles={doubles} />

      <ServeBadge serve={serve} slot={slot} showPips={false} ballSize={20} />

      {/* sets won — the number that actually decides the match, so it gets a chip of its own */}
      <span
        className="v3-digits font-display font-bold text-white/90 rounded-xl bg-white/[0.06] border border-white/10 text-center"
        style={{ fontSize: SET_SIZE, lineHeight: 1, padding: "0.18em 0.4em", minWidth: "1.7em" }}
      >
        {st.setsWon[i]}
      </span>

      <div className="flex items-center gap-[0.9vw] shrink-0">
        {setCells.map((c) => (
          <span
            key={c.key}
            className={`v3-digits font-display text-center ${c.live ? "text-white" : "text-white/45"}`}
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
          className="v3-digits font-display font-bold text-pine-deep bg-gold rounded-2xl text-center shrink-0"
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
  discipline,
}: {
  courtLabel: string;
  match: MatchDTO;
  nextMatch: MatchDTO | null;
  bestOfSets: number;
  tiebreakMode: string;
  discipline?: string;
}) {
  const doubles = discipline !== "singles";

  // How long they have been out there. The question every spectator asks, and
  // nothing on the court answers it.
  const now = useNow(1000);
  const elapsed =
    now && match.startedAt && match.status !== "completed"
      ? Math.max(0, now - Date.parse(match.startedAt))
      : null;
  const beat = useScoreBeat(match);
  const style = BRACKET_STYLE[match.bracket];
  const race = isPointsRace(tiebreakMode);
  const started = match.status === "in_progress";

  // Whose serve it is, and whether it has just changed hands.
  const serve = serveInfo(match.state);
  const handedTo = useServeHandover(serve, match.id);
  const handoverName = handedTo === 1 ? match.player1?.name : handedTo === 2 ? match.player2?.name : null;

  // Can the next point end the match? The engine answers, so this is right for
  // every format — including the races, where the trailing side's point can end it.
  const pressure = started ? pressureInfo(match.state, match.state.config) : null;
  const pressureName =
    pressure?.matchPointFor === 1 ? match.player1?.name : pressure?.matchPointFor === 2 ? match.player2?.name : null;

  const [a, b] = match.state.setsWon;
  const [ga, gb] = match.state.currentSet?.games ?? [0, 0];
  const [pa, pb] = match.state.currentGame?.points ?? [0, 0];
  const lead1 = a > b || (a === b && (ga > gb || (ga === gb && pa > pb)));
  const lead2 = b > a || (a === b && (gb > ga || (ga === gb && pb > pa)));

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col relative bg-court-bg">
      {/* bracket-tinted wash so each draw owns a colour on the big screen */}
      <div className={`absolute inset-0 opacity-[0.07] ${style.solidBg}`} />
      <div className="absolute inset-0 v3-stage-light pointer-events-none" />

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
          {elapsed !== null && (
            <p
              className="font-display tabular-nums text-white/55"
              style={{ fontSize: "clamp(0.75rem, 1.6vw, 1.7rem)" }}
            >
              {formatDuration(elapsed)}
            </p>
          )}
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
        <SideRow match={match} slot={1} leading={lead1} race={race} serve={serve} doubles={doubles} />
        <div className="h-px bg-white/10 mx-[3vw]" />
        <SideRow match={match} slot={2} leading={lead2} race={race} serve={serve} doubles={doubles} />
      </main>

      {/* the stakes of the next point, announced low so it never covers the score */}
      <AnimatePresence>
        {pressure && !handoverName && (
          <motion.div
            key={pressure.suddenDeath ? "sudden-death" : `match-point-${pressure.matchPointFor}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ type: "spring", bounce: 0.4, duration: 0.6 }}
            className="absolute inset-x-0 bottom-[11vh] z-30 flex justify-center pointer-events-none"
          >
            <span
              className={`v3-pressure flex items-center gap-[1vw] rounded-full border px-[2.4vw] py-[1vh] backdrop-blur-sm font-display font-bold uppercase whitespace-nowrap ${
                pressure.suddenDeath
                  ? "border-live/60 bg-live/15 text-live shadow-[0_0_60px_rgba(255,90,95,0.35)]"
                  : "border-gold/60 bg-court-panel/92 text-gold shadow-[0_0_60px_rgba(201,217,53,0.3)]"
              }`}
              style={{ fontSize: "clamp(0.9rem, 2vw, 2.2rem)", letterSpacing: "0.18em" }}
            >
              <span className={`rounded-full animate-ping ${pressure.suddenDeath ? "bg-live" : "bg-gold"}`} style={{ width: "0.5em", height: "0.5em" }} />
              {pressure.suddenDeath ? "Sudden death · next point wins" : `Match point · ${pressureName ?? ""}`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

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
