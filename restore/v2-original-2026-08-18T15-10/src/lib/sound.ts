import { AnimationTier } from "./types";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, startOffset: number, duration: number, type: OscillatorType = "sine", peakGain = 0.15) {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const t0 = audioCtx.currentTime + startOffset;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

function playPoint() {
  tone(920, 0, 0.09, "sine", 0.11);
}

function playGame() {
  tone(660, 0, 0.12, "triangle", 0.13);
  tone(880, 0.1, 0.16, "triangle", 0.13);
}

function playSet() {
  const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
  notes.forEach((f, i) => tone(f, i * 0.12, 0.2, "triangle", 0.15));
}

function playMatch() {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, i) => tone(f, i * 0.11, 0.22, "triangle", 0.17));
}

function playChampion() {
  const fanfare = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
  fanfare.forEach((f, i) => tone(f, i * 0.1, 0.4, "sawtooth", 0.13));
  [261.63, 329.63, 392.0].forEach((f) => tone(f, 0, 1.3, "sine", 0.07)); // sustained low chord
}

export function playTierSound(tier: AnimationTier) {
  switch (tier) {
    case "point":
      return playPoint();
    case "game":
      return playGame();
    case "set":
      return playSet();
    case "match":
      return playMatch();
    case "champion":
      return playChampion();
  }
}

/** Call from a user-gesture handler (e.g. the mute toggle) to satisfy browser autoplay policies. */
export function primeAudio() {
  getCtx();
}
