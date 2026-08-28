import { prisma } from "./db";
import { getIO, EVENTS } from "./socket";
import { getFullSnapshot } from "./bracket/dto";

export async function broadcastSnapshot() {
  const io = getIO();
  if (!io) return;
  const snapshot = await getFullSnapshot(prisma);
  io.emit(EVENTS.STATE_SNAPSHOT, snapshot);
}
