/**
 * In-memory TV scene control, shared across the Node process (same trick as the
 * socket singleton). The control panel writes it; the display reads it live.
 *
 * mode "auto"  -> the TV rotates through scenes on its own timer.
 * mode "pinned" -> the TV holds on `sceneId` and does not advance.
 */
export type TvMode = "auto" | "pinned";

export interface TvControlState {
  mode: TvMode;
  sceneId: string; // which scene to hold on when pinned (also the "current" hint)
  rev: number; // bumped on every change so clients can dedupe
  updatedAt: number;
}

const globalForTv = globalThis as unknown as { tvControl?: TvControlState };

export function getTvControl(): TvControlState {
  if (!globalForTv.tvControl) {
    globalForTv.tvControl = { mode: "auto", sceneId: "compass", rev: 0, updatedAt: Date.now() };
  }
  return globalForTv.tvControl;
}

export function setTvControl(next: { mode?: TvMode; sceneId?: string }): TvControlState {
  const cur = getTvControl();
  const updated: TvControlState = {
    mode: next.mode ?? cur.mode,
    sceneId: next.sceneId ?? cur.sceneId,
    rev: cur.rev + 1,
    updatedAt: Date.now(),
  };
  globalForTv.tvControl = updated;
  return updated;
}
