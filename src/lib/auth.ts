import { prisma } from "./db";

export async function verifyPin(pin: unknown): Promise<boolean> {
  if (typeof pin !== "string" || !pin) return false;
  const cfg = await prisma.tournamentConfig.findUnique({ where: { id: "default" } });
  return !!cfg && cfg.pin === pin;
}
