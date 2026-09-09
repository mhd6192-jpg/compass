// Renaming somebody from the scorer, and the side that is not a person.
//
// `Match.player1Id` names the FIRST member of a side, not the side. In a
// rotating-partners format the screen draws that side as "Ana & Ben", so the
// rename editor opened with "Ana & Ben" in one field and "Cara & Dan" in the
// other, and the route stored whatever came back against Ana and Cara alone.
//
// No typo was needed to trigger it: the fields arrive prefilled and Save only
// requires them non-empty, so opening the editor on an americano match and
// pressing Save renamed Ana to "Ana & Ben". Measured before the guard, a later
// round then read "Ana & Hana & Ben & Gus vs Eve & Finn", and the corrupted
// name went on into the standings, the podium, the archive and the club's
// member history, where nothing ever removes it. The other two people on court
// had no field at all and could never be corrected from that screen.
//
// There is no correct thing to do with such a request, so it is refused rather
// than guessed at — and the buttons are hidden as well, so the refusal is a
// backstop rather than the user's first experience of it.
//
// RESTART `npm run dev:db` BEFORE EACH RUN.
const DEV_DB = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
process.env.POSTGRES_PRISMA_URL = DEV_DB;
process.env.POSTGRES_URL_NON_POOLING = DEV_DB;
process.env.DATABASE_URL = DEV_DB;
process.env.ORGANISER_PIN = "0000000000";

export {};

import { readFileSync } from "node:fs";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const PIN = "1234";

function post(matchId: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/matches/${matchId}/players`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: PIN, ...body }),
  });
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { seedTournament } = await import("../src/lib/bracket/seed");
  const { POST } = await import("../src/app/api/matches/[id]/players/route");

  const wipe = async () => {
    await prisma.pointEvent.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.player.deleteMany({});
    await prisma.tournamentConfig.deleteMany({});
  };

  // --- a rotating draw: every side is two people -----------------------------
  await wipe();
  await seedTournament(prisma, ["Ana", "Ben", "Cara", "Dan", "Eve", "Finn", "Gus", "Hana"], {
    bestOfSets: 1,
    tiebreakMode: "race-to-16",
    raceTarget: 16,
    serveEvery: 4,
    raceWinBy: 0,
    amRounds: 0,
    pin: PIN,
    format: "americano",
    discipline: "doubles",
    courtIds: [1, 2],
  });

  const am = await prisma.match.findFirstOrThrow({ where: { round: 1 }, orderBy: { posIndex: "asc" } });
  check("the seeder really did pair people up", !!am.player1PartnerId && !!am.player2PartnerId);

  const before = (await prisma.player.findMany({ orderBy: { name: "asc" } })).map((p) => p.name);

  // Exactly what pressing Save with nothing typed sends: the side labels.
  const first = await prisma.player.findUniqueOrThrow({ where: { id: am.player1Id! } });
  const partner = await prisma.player.findUniqueOrThrow({ where: { id: am.player1PartnerId! } });
  const sideLabel = `${first.name} & ${partner.name}`;

  const refused = await POST(post(am.id, { player1Name: sideLabel, player2Name: "Whoever & Whoever" }), {
    params: { id: am.id },
  });
  check("a rotating match refuses the rename", refused.status === 400, `status ${refused.status}`);
  const body = (await refused.json()) as { error?: string };
  check("...and says where the rename actually belongs", /who.?s playing/i.test(body.error ?? ""), body.error ?? "");

  const after = (await prisma.player.findMany({ orderBy: { name: "asc" } })).map((p) => p.name);
  check("nobody was renamed", JSON.stringify(before) === JSON.stringify(after));
  check("...so no person is carrying a pair label", after.every((n) => !n.includes(" & ")), after.join(", "));

  // --- a fixed-pair draw: the side IS the entrant, and renaming is right -----
  await wipe();
  await seedTournament(
    prisma,
    Array.from({ length: 16 }, (_, i) => `Pair${i + 1}A/Pair${i + 1}B`),
    {
      bestOfSets: 1,
      tiebreakMode: "standard",
      raceTarget: 0,
      serveEvery: 0,
      raceWinBy: 0,
      amRounds: 0,
      pin: PIN,
      format: "compass",
      discipline: "doubles",
      courtIds: [1, 2],
    }
  );

  const pairMatch = await prisma.match.findFirstOrThrow({
    where: { player1Id: { not: null }, player2Id: { not: null } },
    orderBy: { posIndex: "asc" },
  });
  check("a compass draw has no partners to confuse it", !pairMatch.player1PartnerId && !pairMatch.player2PartnerId);

  const ok = await POST(post(pairMatch.id, { player1Name: "Renamed Team" }), { params: { id: pairMatch.id } });
  check("a real pair can still be renamed", ok.status === 200, `status ${ok.status}`);
  const renamed = await prisma.player.findUniqueOrThrow({ where: { id: pairMatch.player1Id! } });
  check("...and the new name landed on that entrant", renamed.name === "Renamed Team", renamed.name);

  // --- the screen does not offer what the server refuses ---------------------
  // A refusal the coach only meets after typing is a worse experience than a
  // button that was never there, so the page gates it too.
  const scorer = readFileSync("src/app/scorer/[matchId]/page.tsx", "utf8");
  check("the scorer computes whether a side is one entrant", /sidesAreEntrants/.test(scorer));
  const buttons = [...scorer.matchAll(/onClick=\{openNames\}/g)].length;
  const gated = [...scorer.matchAll(/sidesAreEntrants && \(/g)].length;
  check("every rename button is gated on it", buttons > 0 && gated >= buttons, `${gated} gates for ${buttons} buttons`);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
