"use client";

import { motion } from "framer-motion";
import { matchFormatLabel } from "@/lib/types";
import V3Gate from "@/components/v3/V3Gate";
import CeremonyScreen from "@/components/v3/CeremonyScreen";
import V3Standings from "@/components/v3/V3Standings";
import ClubLogo from "@/components/shared/ClubLogo";
import PlayerQr from "@/components/v3/PlayerQr";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import { useNow } from "@/components/v3/useNow";
import { useV3Store } from "@/store/useV3Store";
import { buildVenueView, formatDuration, scoreLine, type CourtCard } from "@/lib/v3/venue";
import { serveInfo } from "@/lib/scoring/serve";
import { Ball } from "@/components/v3/ServeIndicator";

/** ClubLogo already prints the club name, so the headline says what is being played. */
function formatLabel(t: { tiebreakMode: string; raceTarget?: number }): string {
  if (t.tiebreakMode === "race-to-16" || t.tiebreakMode === "race-to-9") return matchFormatLabel(1, t);
  if (t.tiebreakMode === "match-tiebreak") return "Match tiebreak";
  if (t.tiebreakMode === "advantage") return "Advantage sets";
  return "Live scores";
}

/** One court's column. Sized off the number of courts so 2 or 6 both fill the wall. */
function BoardCourt({ card, columns }: { card: CourtCard; columns: number }) {
  const { match } = card;
  const style = match ? BRACKET_STYLE[match.bracket] : null;
  const score = match ? scoreLine(match) : null;
  const serve = match ? serveInfo(match.state) : null;

  // Type shrinks as courts are added, so the board never needs scrolling.
  const nameSize = `clamp(0.9rem, ${Math.max(1.5, 5.5 - columns * 0.7)}vw, 3.2rem)`;
  const scoreSize = `clamp(1.4rem, ${Math.max(2.2, 8 - columns)}vw, 5rem)`;

  return (
    <motion.div
      layout
      className={`flex-1 min-w-0 rounded-3xl border-2 bg-court-panel/80 flex flex-col overflow-hidden ${
        card.onAir ? "border-live/50" : "border-court-line"
      }`}
    >
      <div className="shrink-0 flex items-center justify-between gap-2 px-[1.2vw] py-[1.2vh] border-b border-white/10">
        <span className="font-display uppercase font-bold truncate" style={{ fontSize: "clamp(0.75rem, 1.6vw, 1.8rem)" }}>
          {card.label}
        </span>
        {card.onAir ? (
          <span className="flex items-center gap-1.5 shrink-0 text-live font-display uppercase font-bold" style={{ fontSize: "clamp(0.5rem, 0.9vw, 0.9rem)" }}>
            <span className="w-[0.5em] h-[0.5em] rounded-full bg-live animate-pulse" /> Live
          </span>
        ) : card.screen === "winner" ? (
          <span className="shrink-0 text-gold font-display uppercase" style={{ fontSize: "clamp(0.5rem, 0.9vw, 0.9rem)" }}>
            Finished
          </span>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 flex flex-col justify-center gap-[1.2vh] px-[1.2vw] py-[1.5vh]">
        {match ? (
          <>
            {style && (
              <p className={`font-display uppercase tracking-[0.2em] truncate ${style.text}`} style={{ fontSize: "clamp(0.45rem, 0.85vw, 0.9rem)" }}>
                {match.roundName}
              </p>
            )}
            {([1, 2] as const).map((slot) => {
              const player = slot === 1 ? match.player1 : match.player2;
              const value = slot === 1 ? score!.a : score!.b;
              const won = match.winnerId && player?.id === match.winnerId;
              return (
                <div key={slot} className="flex items-center gap-[0.8vw]">
                  {serve?.slot === slot && <Ball size={Math.max(12, 26 - columns * 2)} spin />}
                  <span
                    className={`flex-1 min-w-0 truncate font-display uppercase font-bold ${won ? "text-gold" : "text-white"}`}
                    style={{ fontSize: nameSize, lineHeight: 1.1 }}
                  >
                    {player?.name ?? "TBD"}
                  </span>
                  <motion.span
                    key={`${slot}-${value}`}
                    initial={{ scale: 0.7, opacity: 0.4 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", bounce: 0.5, duration: 0.4 }}
                    className={`v3-digits font-display font-bold tabular-nums shrink-0 ${card.onAir ? "text-gold" : "text-white/60"}`}
                    style={{ fontSize: scoreSize, lineHeight: 1 }}
                  >
                    {value}
                  </motion.span>
                </div>
              );
            })}
          </>
        ) : (
          <p className="text-white/25 font-display uppercase text-center" style={{ fontSize: "clamp(0.6rem, 1.2vw, 1.2rem)" }}>
            {card.screen === "final" || card.screen === "waiting" ? "Play complete" : "Court free"}
          </p>
        )}
      </div>

      <div className="shrink-0 px-[1.2vw] py-[1vh] border-t border-white/5 flex items-center justify-between gap-2">
        <span className="text-white/30 truncate" style={{ fontSize: "clamp(0.45rem, 0.85vw, 0.9rem)" }}>
          {card.upcoming
            ? `Next: ${card.upcoming.player1?.name ?? "TBD"} v ${card.upcoming.player2?.name ?? "TBD"}`
            : " "}
        </span>
        {card.elapsedMs !== null && (
          <span className="text-white/25 tabular-nums shrink-0" style={{ fontSize: "clamp(0.45rem, 0.8vw, 0.85rem)" }}>
            {formatDuration(card.elapsedMs)}
          </span>
        )}
      </div>
    </motion.div>
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

  const pct = venue.progress.total ? Math.round((venue.progress.completed / venue.progress.total) * 100) : 0;
  const columns = Math.max(1, venue.courts.length);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-court-bg relative">
      <div className="absolute inset-0 v3-stage-light pointer-events-none" />

      <header className="relative shrink-0 flex items-center justify-between gap-[2vw] px-[2.5vw] py-[2vh] border-b border-white/10">
        <div className="flex items-center gap-[1.5vw] min-w-0">
          <ClubLogo size={48} />
          <div className="min-w-0">
            <p className="font-display uppercase tracking-[0.35em] text-gold/70" style={{ fontSize: "clamp(0.5rem, 0.9vw, 0.95rem)" }}>
              Live now
            </p>
            <h1 className="font-display uppercase font-bold truncate" style={{ fontSize: "clamp(1.1rem, 2.6vw, 2.8rem)" }}>
              {formatLabel(snapshot.tournament)}
            </h1>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-[1.5vw]">
          <div className="text-right">
            <p className="font-display tabular-nums text-gold" style={{ fontSize: "clamp(0.9rem, 2vw, 2.2rem)", lineHeight: 1 }}>
              {venue.progress.completed}
              <span className="text-white/30">/{venue.progress.total}</span>
            </p>
            <p className="font-display uppercase tracking-[0.25em] text-white/35" style={{ fontSize: "clamp(0.45rem, 0.8vw, 0.85rem)" }}>
              matches played
            </p>
          </div>
          <div className="w-[12vw] h-[0.9vh] rounded-full bg-white/10 overflow-hidden">
            <motion.div className="h-full bg-gold rounded-full" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} />
          </div>
        </div>
      </header>

      <main className="relative flex-1 min-h-0 flex gap-[1.5vw] px-[2.5vw] py-[2vh]">
        {venue.courts.map((card) => (
          <BoardCourt key={card.courtId} card={card} columns={columns} />
        ))}
        {venue.courts.length === 0 && (
          <p className="m-auto text-white/35 font-display uppercase">No courts configured</p>
        )}
      </main>

      <section className="relative shrink-0 h-[26vh] px-[2.5vw] pb-[2vh] flex gap-[1.5vw]">
        <div className="flex-1 min-w-0 flex">
          <V3Standings matches={snapshot.matches} title="Standings" format={snapshot.tournament.format} />
        </div>

        <div className="w-[26vw] shrink-0 rounded-2xl border border-court-line bg-court-panel px-[1.4vw] py-[1.4vh] flex flex-col overflow-hidden">
          <h2 className="font-display uppercase text-gold shrink-0 mb-[1vh]" style={{ fontSize: "clamp(0.6rem, 1.2vw, 1.3rem)" }}>
            Coming up
          </h2>
          <div className="flex-1 min-h-0 flex flex-col gap-[0.7vh] overflow-hidden">
            {venue.queue.slice(0, 6).map((m) => (
              <p key={m.id} className="text-white/60 truncate" style={{ fontSize: "clamp(0.5rem, 1vw, 1.05rem)" }}>
                {m.player1?.name ?? "TBD"} <span className="text-gold/50">v</span> {m.player2?.name ?? "TBD"}
              </p>
            ))}
            {venue.queue.length === 0 && (
              <p className="text-white/25" style={{ fontSize: "clamp(0.5rem, 1vw, 1.05rem)" }}>
                Every playable match is on court.
              </p>
            )}
          </div>
          <div className="shrink-0 mt-[1vh] pt-[1vh] border-t border-white/5">
            <PlayerQr size={104} />
          </div>
        </div>
      </section>
    </div>
  );
}

export default function BoardPage() {
  return (
    <V3Gate>
      <Board />
    </V3Gate>
  );
}
