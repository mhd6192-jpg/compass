"use client";

/**
 * Ceremony music, synthesised in the browser with Web Audio.
 *
 * No audio files: the TVs are already loading over a phone hotspot at some
 * venues, and a silent 404 on an mp3 during the one moment of the day that
 * cannot be repeated is not a risk worth taking. Everything here is oscillators
 * and envelopes, so it always plays and adds nothing to the page weight.
 *
 * Everything routes through one master gain, which is what the announcer's
 * mute actually controls — killing that node silences a fanfare mid-note
 * instead of letting it ring out over the PA.
 */

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let bed: { stop: () => void } | null = null;
let finale: { stop: () => void } | null = null;
let enabled = true;

const MASTER_LEVEL = 0.5;

function ensure(): Ctx | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = enabled ? MASTER_LEVEL : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** True once the browser has actually allowed audio to run. */
export function audioReady(): boolean {
  return !!ctx && ctx.state === "running";
}

/** Call from a real user gesture (a tap on the TV) to satisfy autoplay policy. */
export function primeAudio(): void {
  const c = ensure();
  if (!c) return;
  void c.resume();
  // A silent blip: some browsers only consider the context "started" once a
  // node has actually run through it.
  const osc = c.createOscillator();
  const g = c.createGain();
  g.gain.value = 0.0001;
  osc.connect(g);
  g.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.02);
}

export function setMusicEnabled(on: boolean): void {
  enabled = on;
  if (!ctx || !master) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(on ? MASTER_LEVEL : 0, now, 0.08);
}

function note(
  freq: number,
  at: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; detune?: number; attack?: number } = {}
) {
  const c = ensure();
  if (!c || !master) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? "triangle";
  osc.frequency.value = freq;
  if (opts.detune) osc.detune.value = opts.detune;
  osc.connect(g);
  g.connect(master);
  const t0 = c.currentTime + at;
  const peak = opts.gain ?? 0.14;
  const attack = opts.attack ?? 0.015;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseSwell(at: number, dur: number, peak = 0.06) {
  const c = ensure();
  if (!c || !master) return;
  const frames = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const band = c.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1200;
  band.Q.value = 0.8;
  const g = c.createGain();
  src.connect(band);
  band.connect(g);
  g.connect(master);
  const t0 = c.currentTime + at;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  // sweep the band upward so it reads as a riser, not just hiss
  band.frequency.setValueAtTime(500, t0);
  band.frequency.linearRampToValueAtTime(5000, t0 + dur);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/** A sustained chord that fades itself in and can be stopped on demand. */
function pad(freqs: number[], gain: number): { stop: () => void } {
  const c = ensure();
  if (!c || !master) return { stop: () => {} };
  const g = c.createGain();
  g.connect(master);
  const t0 = c.currentTime;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 1.2);

  const oscs = freqs.flatMap((f) =>
    [-6, 6].map((detune) => {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(g);
      o.start(t0);
      return o;
    })
  );

  return {
    stop: () => {
      const t = c.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      oscs.forEach((o) => o.stop(t + 1.0));
    },
  };
}

// --- cues -----------------------------------------------------------------

const C4 = 261.63;
const E4 = 329.63;
const G4 = 392.0;
const A4 = 440.0;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const F5 = 698.46;
const G5 = 783.99;
const A5 = 880.0;
const C6 = 1046.5;
const E6 = 1318.51;
const G6 = 1567.98;

/** Warm holding chord while the players gather. Loops until stopped. */
export function startStandbyBed(): void {
  if (bed) return;
  bed = pad([C4, G4, C5, E5], 0.05);
}

export function stopStandbyBed(): void {
  bed?.stop();
  bed = null;
}

/**
 * The build-up under "second place goes to…". Rising noise plus a climbing
 * figure, timed to land exactly when the name hits the screen.
 */
export function playSuspense(seconds: number): void {
  ensure();
  noiseSwell(0, seconds, 0.05);
  const steps = [C4, E4, G4, C5, E5, G5];
  const gap = seconds / (steps.length + 1);
  steps.forEach((f, i) => note(f, i * gap, gap * 1.6, { type: "sine", gain: 0.05 + i * 0.012 }));
  // heartbeat underneath
  for (let i = 0; i < Math.floor(seconds * 2); i++) {
    note(70, i * 0.5, 0.28, { type: "sine", gain: 0.09 });
  }
}

/** The moment a runner-up / third place name appears. */
export function playRevealHit(): void {
  ensure();
  [C5, E5, G5, C6].forEach((f, i) => note(f, i * 0.045, 0.85, { type: "triangle", gain: 0.15 }));
  note(C4, 0, 1.4, { type: "sine", gain: 0.1 });
  noiseSwell(0, 0.35, 0.045);
}

/** The champion. Full brass-ish fanfare with a ringing top. */
export function playChampionFanfare(): void {
  ensure();
  const fanfare: Array<[number, number, number]> = [
    [G4, 0.0, 0.28],
    [C5, 0.18, 0.28],
    [E5, 0.36, 0.28],
    [G5, 0.54, 0.5],
    [E5, 0.92, 0.2],
    [G5, 1.08, 0.2],
    [C6, 1.24, 1.5],
  ];
  fanfare.forEach(([f, at, dur]) => {
    note(f, at, dur, { type: "sawtooth", gain: 0.11 });
    note(f / 2, at, dur, { type: "triangle", gain: 0.07 });
  });
  // sustained chord underneath the last note
  [C4, E4, G4, C5].forEach((f) => note(f, 1.24, 2.4, { type: "sine", gain: 0.07, attack: 0.12 }));
  // shimmer on top
  [C6, E6, G6].forEach((f, i) => note(f, 1.3 + i * 0.08, 1.8, { type: "sine", gain: 0.05 }));
  noiseSwell(1.15, 0.5, 0.05);
}

/** Gentle triumphant loop under the full podium at the end. */
export function startFinaleLoop(): void {
  if (finale) return;
  const c = ensure();
  if (!c) return;
  const chord = pad([C4, G4, C5, E5], 0.045);
  const motif = [C5, E5, G5, A5, G5, E5, D5, F5];
  let step = 0;
  const timer = setInterval(() => {
    note(motif[step % motif.length], 0, 0.7, { type: "triangle", gain: 0.06 });
    step++;
  }, 620);
  finale = {
    stop: () => {
      clearInterval(timer);
      chord.stop();
    },
  };
}

export function stopFinaleLoop(): void {
  finale?.stop();
  finale = null;
}

/** Everything off — used when the ceremony closes or the page unmounts. */
export function stopAllMusic(): void {
  stopStandbyBed();
  stopFinaleLoop();
}
