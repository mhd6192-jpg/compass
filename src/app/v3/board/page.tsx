"use client";

import { motion } from "framer-motion";
import { gamesPerSetOf, isPointsRace, matchFormatLabel, raceTargetOf, type MatchDTO } from "@/lib/types";
import V3Gate from "@/components/v3/V3Gate";
import CeremonyScreen from "@/components/v3/CeremonyScreen";
import V3Standings from "@/components/v3/V3Standings";
import ClubLogo from "@/components/shared/ClubLogo";
import PlayerQr from "@/components/v3/PlayerQr";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import { useNow } from "@/components/v3/useNow";
import { useWakeLock } from "@/components/v3/useWakeLock";
import { useV3Store } from "@/store/useV3Store";
import { buildVenueView, formatDuration, OVERDUE_MS, type CourtCard } from "@/lib/v3/venue";
import { serveInfo } from "@/lib/scoring/serve";
import { Ball } from "@/components/v3/ServeIndicator";

/** ClubLogo already prints the club name, so the headline says what is being played. */
function formatLabel(t: {
  tiebreakMode: string;
  raceTarget?: number;
  bestOfSets?: number;
  gamesPerSet?: number;
  goldenPoint?: boolean;
}): string {
  if (t.tiebreakMode === "race-to-16" || t.tiebreakMode === "race-to-9") return matchFormatLabel(1, t);
  // Set play: say the set length whenever it is not the six a spectator assumes.
  // A finished 4-1 on a court column reads as an abandoned six-game set unless
  // the wall has already said the sets are first to four. `matchFormatLabel` is
  // the one place that sentence is written, and it also knows not to promise a
  // match tiebreak in a best of one, where there is no decider to replace.
  // Anything the players need to know before they walk on: a set length that is
  // not the assumed six, or no deuce — which changes how every 40-40 is played.
  const games = gamesPerSetOf(t);
  if ((games !== 6 || t.goldenPoint) && t.bestOfSets) return matchFormatLabel(t.bestOfSets, t);
  if (t.tiebreakMode === "match-tiebreak") return (t.bestOfSets ?? 3) >= 3 ? "Match tiebreak" : "Live scores";
  if (t.tiebreakMode === "advantage") return "Advantage sets";
  return "Live scores";
}

/**
 * Type sizes for a court card, from how many share the wall.
 *
 * Every size is capped on BOTH axes. The old board scaled off width alone, so
 * a three-court wall in a laptop window ran its rows into the card's footer,
 * and the "Next:" line ended up printed across the second name. A card is a
 * fixed box: whatever the window, the two rows plus the header and footer
 * have to come out of the same height.
 */
function sizes(columns: number) {
  // A share of the card's width: each card is roughly 95vw / columns wide, and
  // a row has to hold a name beside up to three score cells.
  const w = (share: number) => (share / columns).toFixed(2);
  return {
    // A single entrant on one line.
    name: `clamp(1rem, min(${w(13)}vw, 8.5vh), 5rem)`,
    // Each half of a pair, stacked.
    pair: `clamp(0.8rem, min(${w(10.5)}vw, 6vh), 3.6rem)`,
    // Games and points.
    digit: `clamp(1.2rem, min(${w(14.5)}vw, 9vh), 6rem)`,
    // The one number in a points race.
    race: `clamp(2rem, min(${w(24)}vw, 13vh), 9rem)`,
    label: "clamp(0.75rem, min(1.5vw, 2.6vh), 1.7rem)",
    small: "clamp(0.5rem, min(0.85vw, 1.6vh), 0.95rem)",
    pill: "clamp(0.5rem, min(0.8vw, 1.5vh), 0.9rem)",
  };
}

/**
 * The two names on a side.
 *
 * A pair is always stacked, one name per line: the board's columns are a third
 * of the width a court TV has, and "HISHAM/CHAHD" squeezed on one line beside
 * a score was cut to "HISHAM..." — a card that no longer said who was playing.
 * Two shorter lines are read from across a room; one truncated one is not.
 */
function SideName({ match, slot, tone, size }: { match: MatchDTO; slot: 1 | 2; tone: string; size: ReturnType<typeof sizes> }) {
  const player = slot === 1 ? match.player1 : match.player2;
  const members = slot === 1 ? match.player1Members : match.player2Members;
  const name = player?.name ?? "TBD";
  const parts =
    members && members.length === 2
      ? members.map((m) => m.name)
      : name.split(/\s*[/&+]\s*/).map((x) => x.trim()).filter(Boolean);

  if (parts.length !== 2) {
    return (
      <p className={`flex-1 min-w-0 truncate font-display uppercase font-bold tracking-tight ${tone}`} style={{ fontSize: size.name, lineHeight: 1 }}>
        {name}
      </p>
    );
  }
  return (
    <div className="flex-1 min-w-0">
      {parts.map((part, i) => (
        <p key={i} className={`truncate font-display uppercase font-bold tracking-tight ${tone}`} style={{ fontSize: size.pair, lineHeight: 1.05 }}>
          {part}
        </p>
      ))}
    </div>
  );
}

/** One row of the card: who, whether they are serving, and their side of the score. */
function SideRow({
  match,
  slot,
  leading,
  live,
  race,
  showSets,
  size,
}: {
  match: MatchDTO;
  slot: 1 | 2;
  leading: boolean;
  live: boolean;
  race: boolean;
  showSets: boolean;
  size: ReturnType<typeof sizes>;
}) {
  const i = slot - 1;
  const st = match.state;
  const finished = match.status === "completed";
  const player = slot === 1 ? match.player1 : match.player2;
  const won = finished && !!match.winnerId && player?.id === match.winnerId;
  const started = st.totalPoints > 0;
  const serve = serveInfo(st);
  const serving = live && !finished && serve?.slot === slot;
  const tone = won || (live && leading) ? "text-gold" : finished ? "text-white/45" : "text-white";

  let cells: React.ReactNode;
  if (race) {
    // A race is one number. Finished, it is the number that was reached.
    const value = finished && st.completedSets[0]?.tiebreak ? st.completedSets[0].tiebreak[i] : st.currentGame?.display[i] ?? "0";
    const target = raceTargetOf(st.config);
    const pts = finished && st.completedSets[0]?.tiebreak ? st.completedSets[0].tiebreak[i] : st.currentGame?.points[i] ?? 0;
    cells = (
      <div className="flex flex-col items-end shrink-0">
        <motion.span
          key={`race-${slot}-${value}`}
          initial={{ scale: 0.6, opacity: 0.3 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", bounce: 0.5, duration: 0.45 }}
          className={`v3-digits font-display font-bold ${won || (live && leading) ? "text-gold" : finished ? "text-white/45" : "text-white/90"}`}
          style={{ fontSize: size.race, lineHeight: 0.9 }}
        >
          {value}
        </motion.span>
        {!finished && (
          <span className="h-[0.5vh] rounded-full bg-white/[0.08] overflow-hidden mt-[0.4vh]" style={{ width: "4.5em", fontSize: size.small }}>
            <span className={`block h-full rounded-full transition-[width] duration-700 ${leading ? "bg-gold" : "bg-white/30"}`} style={{ width: `${Math.min(100, (pts / target) * 100)}%` }} />
          </span>
        )}
      </div>
    );
  } else {
    const points = live && started && !finished && st.currentGame ? st.currentGame.display[i] : null;
    cells = (
      <div className="flex items-center shrink-0" style={{ gap: "0.35em", fontSize: size.digit }}>
        {showSets && (
          <span
            className={`v3-digits font-display font-bold text-center rounded-[0.22em] border ${won ? "border-gold/50 bg-gold/15 text-gold" : "border-white/12 bg-white/[0.05] text-white/85"}`}
            style={{ fontSize: "0.72em", lineHeight: 1, padding: "0.18em 0.32em", minWidth: "1.55em" }}
          >
            {st.setsWon[i]}
          </span>
        )}
        {st.completedSets.map((s, idx) => (
          <span
            key={`s${idx}`}
            className={`v3-digits font-display font-bold text-center ${won ? "text-gold" : finished ? "text-white/45" : "text-white/40"}`}
            style={{ lineHeight: 1, minWidth: "1.15em" }}
          >
            {s.games[i]}
            {s.tiebreak && (
              <sup className="text-white/35 font-normal" style={{ fontSize: "0.4em", marginLeft: "0.1em" }}>
                {s.tiebreak[i]}
              </sup>
            )}
          </span>
        ))}
        {st.currentSet && !finished && (
          <span className={`v3-digits font-display font-bold text-center ${live ? "text-white" : "text-white/70"}`} style={{ lineHeight: 1, minWidth: "1.15em" }}>
            {st.currentSet.games[i]}
          </span>
        )}
        {points !== null && (
          <motion.span
            key={`pt-${slot}-${points}-${st.totalPoints}`}
            initial={{ scale: 0.6, opacity: 0.3 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0.55, duration: 0.4 }}
            className="v3-digits font-display font-bold text-pine-deep bg-gold rounded-[0.22em] text-center"
            style={{ fontSize: "0.86em", lineHeight: 1, padding: "0.12em 0.22em", minWidth: "1.55em", marginLeft: "0.2em" }}
          >
            {points}
          </motion.span>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-[0.8vw] min-w-0 py-[0.5vh]">
      <span className="shrink-0 flex items-center justify-center" style={{ width: "1.2em", fontSize: size.label }}>
        {serving ? <Ball size={22} spin /> : won ? <span className="text-gold" style={{ fontSize: "1.1em" }}>✓</span> : null}
      </span>
      <SideName match={match} slot={slot} tone={tone} size={size} />
      {cells}
    </div>
  );
}

/** What the corner of the card says about the court. */
function Status({ card, size }: { card: CourtCard; size: ReturnType<typeof sizes> }) {
  const base = "shrink-0 flex items-center gap-[0.5em] rounded-full border font-display font-bold uppercase tracking-[0.18em] px-[0.9em] py-[0.35em]";
  const style = { fontSize: size.pill, lineHeight: 1 };
  if (card.onAir && card.match?.status !== "completed") {
    return (
      <span className={`${base} border-live/60 bg-live/15 text-live`} style={style}>
        <span className="w-[0.6em] h-[0.6em] rounded-full bg-live animate-pulse" /> Live
      </span>
    );
  }
  if (card.screen === "winner" || card.match?.status === "completed") {
    return (
      <span className={`${base} border-gold/50 bg-gold/10 text-gold`} style={style}>
        Final
      </span>
    );
  }
  if (card.match && card.waitingMs !== null && card.waitingMs > OVERDUE_MS) {
    return (
      <span className={`${base} border-gold/70 bg-gold/20 text-gold`} style={style}>
        <span className="w-[0.6em] h-[0.6em] rounded-full bg-gold animate-ping" /> Waiting {formatDuration(card.waitingMs)}
      </span>
    );
  }
  if (card.match) {
    return (
      <span className={`${base} border-white/15 bg-white/[0.04] text-white/55`} style={style}>
        Next on
      </span>
    );
  }
  return null;
}

/** One court's column. Sized off the number of courts so 2 or 6 both fill the wall. */
function BoardCourt({ card, columns, bestOfSets }: { card: CourtCard; columns: number; bestOfSets: number }) {
  const { match } = card;
  const style = match ? BRACKET_STYLE[match.bracket] : null;
  const size = sizes(columns);
  const live = card.onAir && match?.status !== "completed";
  const race = !!match && isPointsRace(match.state.config.tiebreakMode);

  // Who is ahead, so the card can lean towards them the way the court TV does.
  let lead1 = false;
  let lead2 = false;
  if (match) {
    const [a, b] = match.state.setsWon;
    const [ga, gb] = match.state.currentSet?.games ?? [0, 0];
    const [pa, pb] = match.state.currentGame?.points ?? [0, 0];
    lead1 = a > b || (a === b && (ga > gb || (ga === gb && pa > pb)));
    lead2 = b > a || (a === b && (gb > ga || (ga === gb && pb > pa)));
  }

  return (
    <motion.div
      layout
      className={`relative flex-1 min-w-0 rounded-[1.4vw] border flex flex-col overflow-hidden ${
        live
          ? "border-live/60 bg-court-panel shadow-[0_0_50px_rgba(255,90,95,0.14),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-white/10 bg-court-panel/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      }`}
    >
      {/* the draw's colour, as a wash along the top of the card */}
      {style && <div className={`absolute inset-x-0 top-0 h-[40%] opacity-[0.07] pointer-events-none bg-gradient-to-b ${style.solidBg.replace("bg-", "from-")} to-transparent`} />}
      {live && <div className="absolute inset-x-0 top-0 h-[0.35vh] bg-live" />}

      <div className="relative shrink-0 flex items-center justify-between gap-[0.8vw] px-[1.2vw] pt-[1.6vh] pb-[1vh]">
        <div className="min-w-0 flex items-baseline gap-[0.8vw]">
          <span className="font-display uppercase font-bold tracking-[0.06em] text-white shrink-0" style={{ fontSize: size.label, lineHeight: 1 }}>
            {card.label}
          </span>
          {match && style && (
            <span className={`font-display uppercase tracking-[0.22em] truncate ${style.text}`} style={{ fontSize: size.small }}>
              {match.roundName}
            </span>
          )}
        </div>
        <Status card={card} size={size} />
      </div>

      <div className="relative flex-1 min-h-0 flex flex-col justify-center px-[1.2vw]">
        {match ? (
          <>
            <SideRow match={match} slot={1} leading={lead1} live={live} race={race} showSets={bestOfSets > 1 && !race} size={size} />
            <div className="h-px bg-white/[0.08] my-[0.3vh]" />
            <SideRow match={match} slot={2} leading={lead2} live={live} race={race} showSets={bestOfSets > 1 && !race} size={size} />
          </>
        ) : (
          <div className="flex flex-col items-center gap-[0.8vh] text-center">
            <p className="font-display uppercase tracking-[0.2em] text-white/30" style={{ fontSize: size.label }}>
              {card.screen === "final" || card.screen === "waiting" ? "Play complete" : "Court free"}
            </p>
          </div>
        )}
      </div>

      <div className="relative shrink-0 px-[1.2vw] py-[1vh] border-t border-white/[0.07] flex items-center justify-between gap-[0.8vw] bg-black/20">
        <p className="min-w-0 truncate" style={{ fontSize: size.small }}>
          {card.upcoming ? (
            <>
              <span className="font-display uppercase tracking-[0.2em] text-gold/60 mr-[0.6em]">Next</span>
              <span className="text-white/55">
                {card.upcoming.player1?.name ?? "TBD"} <span className="text-white/25">v</span> {card.upcoming.player2?.name ?? "TBD"}
              </span>
            </>
          ) : (
            <span className="text-white/25">&nbsp;</span>
          )}
        </p>
        {card.elapsedMs !== null && (
          <span className="shrink-0 font-display tabular-nums text-white/50" style={{ fontSize: size.small }}>
            {formatDuration(card.elapsedMs)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

/** The wall clock, for the people who keep asking what time the final is. */
function Clock({ now }: { now: number | null }) {
  if (!now) return null;
  const d = new Date(now);
  return (
    <p className="font-display tabular-nums text-white/70" style={{ fontSize: "clamp(1rem, 2.2vw, 2.4rem)", lineHeight: 1 }}>
      {String(d.getHours()).padStart(2, "0")}
      <span className="text-white/30 animate-pulse">:</span>
      {String(d.getMinutes()).padStart(2, "0")}
    </p>
  );
}

/**
 * The board for the lobby or the entrance wall.
 *
 * Every court screen shows one court by design — a player walking on should see
 * their own name, not a grid. This is the opposite screen: everything at once,
 * for the people who are not on a court yet. It joins the awards presentation
 * when that starts, so the room doesn't have one screen out of step during the
 * only moment the whole venue is watching together.
 */
function Board() {
  const snapshot = useV3Store((s) => s.snapshot)!;
  const now = useNow();
  const venue = buildVenueView(snapshot, now ?? 0);

  if (venue.ceremonyRunning) {
    return <CeremonyScreen ceremony={snapshot.v2.ceremony} />;
  }

  // Against the evening's scheduled size, not the rows drawn so far — a format
  // that builds each round as the last one finishes would otherwise read about
  // half done all night and jump to full at the end.
  const evening = venue.progress.scheduled ?? venue.progress.total;
  const pct = evening ? Math.round((venue.progress.completed / evening) * 100) : 0;
  const columns = Math.max(1, venue.courts.length);
  const liveCount = venue.courts.filter((c) => c.onAir && c.match?.status !== "completed").length;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-court-bg relative">
      <div className="absolute inset-0 v3-stage-light pointer-events-none" />

      <header className="relative shrink-0 flex items-center justify-between gap-[2vw] px-[2.5vw] py-[1.6vh] border-b border-white/10 bg-gradient-to-r from-white/[0.03] to-transparent">
        <div className="flex items-center gap-[1.6vw] min-w-0">
          <ClubLogo size={46} />
          <div className="w-px h-[5vh] bg-white/10 shrink-0" />
          <div className="min-w-0">
            <p className="font-display uppercase tracking-[0.35em] text-gold/70 flex items-center gap-[0.6em]" style={{ fontSize: "clamp(0.5rem, 0.85vw, 0.9rem)" }}>
              {liveCount > 0 ? (
                <>
                  <span className="w-[0.6em] h-[0.6em] rounded-full bg-live animate-pulse" />
                  {liveCount} {liveCount === 1 ? "court" : "courts"} live
                </>
              ) : (
                "Tonight"
              )}
            </p>
            <h1 className="font-display uppercase font-bold truncate" style={{ fontSize: "clamp(1.1rem, 2.4vw, 2.6rem)", lineHeight: 1.1 }}>
              {formatLabel(snapshot.tournament)}
            </h1>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-[2vw]">
          <div className="flex items-center gap-[1.2vw]">
            <div className="text-right">
              <p className="font-display tabular-nums text-gold" style={{ fontSize: "clamp(0.9rem, 2vw, 2.2rem)", lineHeight: 1 }}>
                {venue.progress.completed}
                <span className="text-white/30">/{evening}</span>
              </p>
              <p className="font-display uppercase tracking-[0.25em] text-white/35" style={{ fontSize: "clamp(0.45rem, 0.75vw, 0.8rem)" }}>
                matches played
              </p>
            </div>
            <div className="w-[11vw] h-[0.8vh] rounded-full bg-white/10 overflow-hidden">
              <motion.div className="h-full bg-gold rounded-full" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
            </div>
          </div>
          <div className="w-px h-[5vh] bg-white/10" />
          <Clock now={now} />
          <div className="w-px h-[5vh] bg-white/10" />
          <PlayerQr size={54} />
        </div>
      </header>

      {/* Only ever on screen when a court is genuinely standing empty. Sized to
          be read from the far side of the room, because the person it is aimed
          at is the one who is not looking at it. */}
      {venue.callouts.length > 0 && (
        <motion.section
          // Opacity only. Animating the height of a flex child leaves framer
          // measuring a strip whose text is sized in viewport units, and it
          // settles on a few clipped pixels — which is the one thing this must
          // never be, since it exists to be read across a room.
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative shrink-0 border-b-2 border-gold/70 bg-gradient-to-r from-gold/25 via-gold/10 to-gold/5 px-[2.5vw] py-[1.2vh] flex flex-col gap-[0.6vh]"
        >
          {venue.callouts.map((call) => (
            <div key={call.courtId} className="flex items-center gap-[1.5vw] min-w-0">
              <span className="shrink-0 w-[0.8vw] h-[0.8vw] rounded-full bg-gold animate-ping" />
              <span className="font-display uppercase font-bold text-gold shrink-0 tracking-[0.12em]" style={{ fontSize: "clamp(0.9rem, min(2.1vw, 4vh), 2.5rem)", lineHeight: 1.1 }}>
                {call.courtLabel} needs
              </span>
              <span className="font-display uppercase font-bold truncate min-w-0 text-white" style={{ fontSize: "clamp(0.9rem, min(2.1vw, 4vh), 2.5rem)", lineHeight: 1.1 }}>
                {call.names.join(" · ")}
              </span>
              <span className="ml-auto shrink-0 font-display uppercase tracking-[0.15em] tabular-nums text-gold/80" style={{ fontSize: "clamp(0.55rem, 1.05vw, 1.15rem)" }}>
                waiting {formatDuration(call.waitingMs)}
              </span>
            </div>
          ))}
        </motion.section>
      )}

      <main className="relative flex-1 min-h-0 flex gap-[1.4vw] px-[2.5vw] pt-[1.8vh] pb-[1.4vh]">
        {venue.courts.map((card) => (
          <BoardCourt key={card.courtId} card={card} columns={columns} bestOfSets={snapshot.tournament.bestOfSets} />
        ))}
        {venue.courts.length === 0 && (
          <p className="m-auto text-white/35 font-display uppercase">No courts configured</p>
        )}
      </main>

      {/* The standings strip has to be tall enough for a row somebody can read
          from across the room. At 26vh a full field came out at 9-11px, which
          is a picture of a table rather than a table. */}
      {/* The whole width, and enough height for every team of every group on
          one screen: the queue that used to sit beside it is on each court
          card's footer already, and the table is what people walk over to
          read. */}
      <section className="relative shrink-0 h-[40vh] px-[2.5vw] pb-[1.8vh] flex">
        <V3Standings
          matches={snapshot.matches}
          title="Standings"
          format={snapshot.tournament.format}
          tiebreakMode={snapshot.tournament.tiebreakMode}
        />
      </section>
    </div>
  );
}

export default function BoardPage() {
  // Outside the gate, so the board stays awake while it is still connecting
  // and while it is showing an empty venue between events.
  useWakeLock();

  return (
    <V3Gate>
      <Board />
    </V3Gate>
  );
}
