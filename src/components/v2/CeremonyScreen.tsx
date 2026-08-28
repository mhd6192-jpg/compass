"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Confetti from "@/components/display/Confetti";
import Trophy from "./Trophy";
import ClubLogo, { ClubMark } from "@/components/shared/ClubLogo";
import { AwardDTO, CeremonyDTO, currentAward, revealedAwards } from "@/lib/v2/stage";
import {
  playChampionFanfare,
  playRevealHit,
  playSuspense,
  primeAudio,
  setMusicEnabled,
  startFinaleLoop,
  startStandbyBed,
  stopAllMusic,
  stopFinaleLoop,
  stopStandbyBed,
} from "@/lib/v2/music";

const BRAND_CONFETTI = ["#C9D935", "#1B8A3E", "#ffffff", "#D6DF20", "#8FBF3F"];

const ORDINALS = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth"];

export function placeTitle(place: number): string {
  if (place === 1) return "Champion";
  if (place === 2) return "Runner-up";
  return `${ORDINALS[place] ?? place} place`;
}

export function placeMedal(place: number): string {
  return place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "🎖️";
}

/** How the announcer would say it out loud. */
function callLine(place: number): string {
  if (place === 1) return "And your champion is";
  if (place === 2) return "Your runner-up is";
  return `${ORDINALS[place] ?? place} place goes to`;
}

/** The build-up before a name lands. The champion gets the longest wait. */
function buildMs(place: number): number {
  return place === 1 ? 4200 : 2800;
}

/** Podium block heights, tallest in the middle. */
const BLOCK_HEIGHT: Record<number, string> = { 1: "100%", 2: "76%", 3: "60%", 4: "50%", 5: "43%", 6: "38%" };

/**
 * Stage order for the blocks: the champion in the centre, the rest alternating
 * outwards — 2nd on their left, 3rd on their right, exactly how a real podium
 * is built.
 */
function stageOrder(places: number[]): number[] {
  const asc = [...places].sort((a, b) => a - b);
  const left: number[] = [];
  const right: number[] = [];
  asc.slice(1).forEach((p, i) => (i % 2 === 0 ? left.unshift(p) : right.push(p)));
  return asc.length ? [...left, asc[0], ...right] : [];
}

function PodiumBlock({
  place,
  award,
  revealed,
  spotlight,
  compact,
}: {
  place: number;
  award: AwardDTO | undefined;
  revealed: boolean;
  spotlight: boolean;
  compact: boolean;
}) {
  const height = BLOCK_HEIGHT[place] ?? "38%";

  return (
    <div className="flex-1 min-w-0 flex flex-col items-center h-full">
      {/* The name sits above its block and only appears once announced. The name
          strip is auto-sized and the block area takes the rest, so the block
          percentages above are relative to the same space for every place —
          otherwise flex-shrink flattens the podium into three equal slabs. */}
      <div className="w-full shrink-0 text-center min-h-[6vh] flex flex-col justify-end px-[0.5vw] pb-[1.2vh]">
        {revealed && award ? (
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", bounce: 0.4, duration: 0.8 }}
          >
            <p style={{ fontSize: compact ? "clamp(1.4rem, 3.2vw, 3.4rem)" : "clamp(1.8rem, 4vw, 4.5rem)", lineHeight: 1 }}>
              {placeMedal(place)}
            </p>
            <p
              className={`font-display font-bold uppercase truncate ${place === 1 ? "text-gold text-shadow-glow" : "text-white"}`}
              style={{ fontSize: compact ? "clamp(0.9rem, 2.1vw, 2.3rem)" : "clamp(1.1rem, 2.8vw, 3.2rem)", lineHeight: 1.1 }}
            >
              {award.name}
            </p>
          </motion.div>
        ) : (
          <p className="font-display text-white/15" style={{ fontSize: "clamp(1.2rem, 3vw, 3rem)", lineHeight: 1 }}>
            ?
          </p>
        )}
      </div>

      <div className="w-full flex-1 min-h-0 flex items-end">
        <motion.div
          initial={false}
          animate={{
            opacity: revealed ? 1 : 0.28,
            boxShadow: spotlight ? "0 0 60px rgba(201,217,53,0.45)" : "0 0 0 rgba(0,0,0,0)",
          }}
          transition={{ duration: 0.6 }}
          className={`w-full rounded-t-2xl border-x border-t flex flex-col items-center justify-start pt-[1.4vh] ${
            place === 1 ? "border-gold/60 bg-gradient-to-b from-gold/25 to-gold/[0.04]" : "border-white/15 bg-white/[0.05]"
          }`}
          style={{ height }}
        >
          <span
            className={`font-display font-bold ${place === 1 ? "text-gold" : "text-white/60"}`}
            style={{ fontSize: "clamp(1.4rem, 3.4vw, 3.8rem)", lineHeight: 1 }}
          >
            {place}
          </span>
          <span
            className="font-display uppercase tracking-[0.25em] text-white/35 mt-[0.4vh] text-center px-1"
            style={{ fontSize: "clamp(0.5rem, 0.95vw, 0.95rem)" }}
          >
            {placeTitle(place)}
          </span>
        </motion.div>
      </div>
    </div>
  );
}

function Podium({ ceremony, compact, revealedNow }: { ceremony: CeremonyDTO; compact: boolean; revealedNow: boolean }) {
  const order = stageOrder(ceremony.places);
  const active = currentAward(ceremony);
  // During the build-up the current place stays a "?" — filling its block early
  // would answer the question the screen is still asking.
  const shown = revealedAwards(ceremony).filter((a) => revealedNow || a.place !== active?.place);

  return (
    <div className="w-full flex items-end justify-center gap-[1.5vw] px-[6vw]" style={{ height: compact ? "34vh" : "50vh" }}>
      {order.map((place) => {
        const award = ceremony.awards.find((a) => a.place === place);
        return (
          <PodiumBlock
            key={place}
            place={place}
            award={award}
            revealed={shown.some((a) => a.place === place)}
            spotlight={active?.place === place}
            compact={compact}
          />
        );
      })}
    </div>
  );
}

function Standby() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="flex flex-col items-center text-center gap-[2.5vh]"
    >
      <span className="v2-breathe">
        <ClubLogo size={80} />
      </span>
      <h1
        className="font-display font-bold uppercase text-white tracking-tight"
        style={{ fontSize: "clamp(2.2rem, 7vw, 8rem)", lineHeight: 1 }}
      >
        Awards Presentation
      </h1>
      <p className="font-display uppercase tracking-[0.42em] text-gold" style={{ fontSize: "clamp(0.8rem, 2vw, 2.2rem)" }}>
        Players to centre court
      </p>
    </motion.div>
  );
}

/** Beat one: the call. Everyone looks up, nobody knows the name yet. */
function CallOut({ place, ms }: { place: number; ms: number }) {
  return (
    <motion.div
      key={`call-${place}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center text-center px-[5vw]"
    >
      <motion.p
        animate={{ scale: [1, 1.12, 1], rotate: [0, -6, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ fontSize: "clamp(2.4rem, 7vw, 8rem)", lineHeight: 1 }}
      >
        {placeMedal(place)}
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="font-display uppercase text-white tracking-[0.3em] mt-[2.5vh]"
        style={{ fontSize: "clamp(1.2rem, 3.6vw, 4rem)" }}
      >
        {callLine(place)}
      </motion.p>

      <motion.div
        className="h-[0.5vh] bg-gold rounded-full mt-[3vh]"
        initial={{ width: 0 }}
        animate={{ width: "42vw" }}
        transition={{ duration: ms / 1000, ease: "linear" }}
      />

      <motion.p
        animate={{ opacity: [0.25, 0.7, 0.25] }}
        transition={{ duration: 1.2, repeat: Infinity }}
        className="font-display uppercase tracking-[0.4em] text-white/40 mt-[3vh]"
        style={{ fontSize: "clamp(0.7rem, 1.6vw, 1.7rem)" }}
      >
        {placeTitle(place)}
      </motion.p>
    </motion.div>
  );
}

/** Beat two: the name, as big as the screen allows. */
function Spotlight({ award }: { award: AwardDTO }) {
  const isChampion = award.place === 1;

  return (
    <motion.div
      key={`reveal-${award.place}`}
      initial={{ opacity: 0, scale: 0.86 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", bounce: 0.3, duration: 0.9 }}
      className="flex flex-col items-center text-center px-[5vw]"
    >
      {isChampion ? (
        <Trophy size={Math.min(230, typeof window === "undefined" ? 200 : window.innerHeight * 0.22)} />
      ) : (
        <motion.p
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", bounce: 0.6, delay: 0.1 }}
          style={{ fontSize: "clamp(2.2rem, 6vw, 7rem)", lineHeight: 1 }}
        >
          {placeMedal(award.place)}
        </motion.p>
      )}

      <motion.p
        initial={{ opacity: 0, letterSpacing: "1em" }}
        animate={{ opacity: 1, letterSpacing: "0.42em" }}
        transition={{ duration: 0.7, delay: 0.15 }}
        className="font-display uppercase text-gold mt-[1.5vh]"
        style={{ fontSize: "clamp(0.85rem, 2.1vw, 2.3rem)" }}
      >
        {placeTitle(award.place)}
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 36, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", bounce: 0.42, delay: 0.3 }}
        className={`font-display font-bold uppercase mt-[1vh] max-w-[92vw] break-words ${
          isChampion ? "v2-shine text-gold text-shadow-glow" : "text-white"
        }`}
        style={{ fontSize: isChampion ? "clamp(2.8rem, 10vw, 11rem)" : "clamp(2.6rem, 9vw, 10rem)", lineHeight: 0.98 }}
      >
        {award.name}
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="text-white/45 mt-[2vh]"
        style={{ fontSize: "clamp(0.85rem, 2vw, 2.1rem)" }}
      >
        {award.detail}
      </motion.p>
    </motion.div>
  );
}

/**
 * The venue-wide awards presentation, shown on every court TV at once.
 *
 * Each award is two beats: the call ("your runner-up is…") holds the screen
 * while the player walks up and takes their medal, then the name lands full
 * screen. Nothing advances on a timer — the announcer's phone drives every
 * step, so the champion is never revealed a second before it is meant to be.
 */
export default function CeremonyScreen({ ceremony }: { ceremony: CeremonyDTO }) {
  const award = currentAward(ceremony);
  const complete = ceremony.stage === "complete";
  const champion = ceremony.awards.find((a) => a.place === 1);

  // Two-beat reveal, restarted whenever the announcer moves to another award.
  const [revealed, setRevealed] = useState(false);
  const beatKey = `${ceremony.stage}:${ceremony.cursor}`;
  useEffect(() => {
    if (!award) {
      setRevealed(false);
      return;
    }
    setRevealed(false);
    const t = setTimeout(() => setRevealed(true), buildMs(award.place));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatKey]);

  // --- music ---------------------------------------------------------------
  const lastCue = useRef<string>("");

  // Browsers will not start audio until the page has seen a real gesture. Rather
  // than parking a button on a screen whose whole job is to be looked at, any
  // touch or key anywhere on the TV unlocks it silently. If nobody ever touches
  // it, the ceremony simply runs without sound.
  useEffect(() => {
    const unlock = () => primeAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    setMusicEnabled(ceremony.soundOn);
  }, [ceremony.soundOn]);

  useEffect(() => {
    if (!ceremony.soundOn) {
      stopAllMusic();
      return;
    }
    const cue = `${beatKey}:${revealed}`;
    if (lastCue.current === cue) return;
    lastCue.current = cue;

    if (ceremony.stage === "standby") {
      stopFinaleLoop();
      startStandbyBed();
    } else if (ceremony.stage === "revealing" && award) {
      stopFinaleLoop();
      if (!revealed) {
        startStandbyBed();
        playSuspense(buildMs(award.place) / 1000);
      } else {
        stopStandbyBed();
        if (award.place === 1) playChampionFanfare();
        else playRevealHit();
      }
    } else if (complete) {
      stopStandbyBed();
      startFinaleLoop();
    }
  }, [beatKey, revealed, ceremony.soundOn, ceremony.stage, award, complete]);

  useEffect(() => () => stopAllMusic(), []);

  const celebrate = complete || (revealed && award?.place === 1);
  const showConfetti = complete || (revealed && !!award);

  return (
    <div className="h-screen w-screen overflow-hidden relative flex flex-col bg-court-bg v2-vignette">
      <div className="absolute inset-0 v2-stage-light" />
      {celebrate && (
        <div className="v2-rays absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[190vmax] h-[190vmax] rounded-full" />
      )}
      {showConfetti && (
        <Confetti
          key={`confetti-${beatKey}`}
          count={complete ? 300 : award?.place === 1 ? 260 : 150}
          colors={BRAND_CONFETTI}
        />
      )}
      {revealed && award && (
        <motion.div
          key={`flash-${beatKey}`}
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="absolute inset-0 bg-white pointer-events-none z-20"
        />
      )}

      {ceremony.stage === "standby" ? (
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <Standby />
        </div>
      ) : complete ? (
        <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center gap-[2vh] py-[2vh]">
          <motion.div
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="text-center flex flex-col items-center"
          >
            <Trophy size={Math.min(180, typeof window === "undefined" ? 150 : window.innerHeight * 0.17)} />
            <p
              className="font-display uppercase tracking-[0.45em] text-gold mt-[1vh]"
              style={{ fontSize: "clamp(0.75rem, 1.8vw, 2rem)" }}
            >
              Congratulations
            </p>
            <h1
              className="font-display font-bold uppercase text-white tracking-tight"
              style={{ fontSize: "clamp(1.6rem, 4.6vw, 5rem)", lineHeight: 1.05 }}
            >
              {champion ? `${champion.name} — Champion` : "Final Podium"}
            </h1>
          </motion.div>
          <Podium ceremony={ceremony} compact={false} revealedNow />
        </div>
      ) : (
        <div className="relative z-10 flex-1 min-h-0 flex flex-col justify-between py-[3vh]">
          <div className="flex-1 min-h-0 flex items-center justify-center">
            {award && !revealed && <CallOut place={award.place} ms={buildMs(award.place)} />}
            {award && revealed && <Spotlight award={award} />}
          </div>
          <Podium ceremony={ceremony} compact revealedNow={revealed} />
        </div>
      )}

      <div className="relative z-10 shrink-0 flex items-center justify-center gap-[1.2vw] pb-[2.5vh] opacity-45">
        <ClubMark size={30} />
        <span className="font-display uppercase tracking-[0.35em] text-white/50" style={{ fontSize: "clamp(0.5rem, 0.95vw, 0.95rem)" }}>
          Alhayat Tennis Center
        </span>
      </div>

    </div>
  );
}
