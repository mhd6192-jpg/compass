import { prisma } from "../src/lib/db";

async function main() {
  await prisma.pointEvent.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.tournamentConfig.deleteMany({});
  await prisma.$disconnect();
  console.log("Reset done.");
}

main();
