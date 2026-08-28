import type { Server as IOServer } from "socket.io";

const globalForIO = globalThis as unknown as { io?: IOServer };

export function setIO(io: IOServer) {
  globalForIO.io = io;
}

export function getIO(): IOServer | undefined {
  return globalForIO.io;
}

// Event names shared between server emitters and client listeners.
export const EVENTS = {
  STATE_SNAPSHOT: "state:snapshot", // full snapshot, sent on demand/connect and after every mutation
  MATCH_POINT: "match:point", // fine-grained point event, carries the animation tier to fire
  MATCH_COMPLETED: "match:completed", // a match finished (normal or forced end) - ticker fodder
  TOURNAMENT_STARTED: "tournament:started",
  TV_CONTROL: "tv:control", // TV scene control changed (auto/pin, scene id)
} as const;
