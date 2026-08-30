// Saved entrant lists against the real database: saving, listing, replacing by
// name, deleting — and the property that actually matters, that a roster
// survives the reset which wipes the players.
//
// RESTART `npm run dev:db` BEFORE EACH RUN.
import { PrismaClient } from "@prisma/client";

const URL = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
const prisma = new PrismaClient({ datasources: { db: { url: URL } } });

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  await prisma.savedRoster.deleteMany({});

  const names = ["Ana", "Ben", "Cara", "Dan", "Eve", "Finn", "Gia", "Hugo"];
  const saved = await prisma.savedRoster.create({ data: { label: "Tuesday night", names, format: "americano" } });
  check("a list can be saved", saved.label === "Tuesday night");
  check("the names are kept in entry order", JSON.stringify(saved.names) === JSON.stringify(names), JSON.stringify(saved.names));

  // Saving under the same name replaces, so "save" doubles as "update".
  const changed = [...names, "Iris", "Jack"];
  const again = await prisma.savedRoster.upsert({
    where: { label: "Tuesday night" },
    create: { label: "Tuesday night", names: changed, format: "mexicano" },
    update: { names: changed, format: "mexicano" },
  });
  check("saving the same name replaces rather than duplicating", again.id === saved.id);
  check("the replacement took", (again.names as string[]).length === 10, String((again.names as string[]).length));
  check("only one row exists for that name", (await prisma.savedRoster.count({ where: { label: "Tuesday night" } })) === 1);

  await prisma.savedRoster.create({ data: { label: "Ladies league", names: names.slice(0, 4), format: "mixicano" } });
  const all = await prisma.savedRoster.findMany({ orderBy: { updatedAt: "desc" } });
  check("both lists are listed", all.length === 2, all.map((r) => r.label).join(","));

  // The point of the feature: the roster outlives the tournament it was used for.
  await prisma.pointEvent.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.court.deleteMany({});
  await prisma.tournamentConfig.deleteMany({});
  const afterReset = await prisma.savedRoster.findMany();
  check("lists survive a full tournament reset", afterReset.length === 2, `${afterReset.length} still saved`);
  check("players really were wiped", (await prisma.player.count()) === 0);

  await prisma.savedRoster.delete({ where: { id: saved.id } });
  check("a list can be deleted", (await prisma.savedRoster.count()) === 1);

  await prisma.savedRoster.deleteMany({});
  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
