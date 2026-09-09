// A refusal the server means, against a fault it suffered.
//
// The offline queue decides whether to keep a coach's points or throw them away
// purely from the status code that comes back. The point route used to answer
// 400 for everything its try/catch caught — an out-of-step device and a
// database blip alike — so a transient failure deleted a backlog of points a
// coach had already tapped. That is the one thing the queue exists to prevent,
// and it was reachable through the door next to the one `checkOutbox429.ts` was
// written to close.
//
// So the two are separated at the source: a decision is a 4xx and clears that
// match's queue, a fault is a 5xx and the points wait. This pins the contract
// the queue is built on.
//
// RESTART `npm run dev:db` BEFORE EACH RUN.
const DEV_DB = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
process.env.POSTGRES_PRISMA_URL = DEV_DB;
process.env.POSTGRES_URL_NON_POOLING = DEV_DB;
process.env.DATABASE_URL = DEV_DB;
process.env.ORGANISER_PIN = "0000000000";

export {};

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const PIN = "1234";

function req(matchId: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/matches/${matchId}/point`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: PIN, slot: 1, ...body }),
  });
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { seedTournament } = await import("../src/lib/bracket/seed");
  const { POST } = await import("../src/app/api/matches/[id]/point/route");
  const { ScoringRefusal } = await import("../src/lib/bracket/routing");

  await prisma.pointEvent.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.player.deleteMany({});
  await prisma.tournamentConfig.deleteMany({});

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

  const m = await prisma.match.findFirstOrThrow({ where: { round: 1 }, orderBy: { posIndex: "asc" } });
  const send = (body: Record<string, unknown>, id = m.id) => POST(req(id, body), { params: { id } });

  const ok = await send({ expectedSeq: 1 });
  check("a point is accepted", ok.status === 200, `status ${ok.status}`);

  const replay = await send({ expectedSeq: 1 });
  const replayBody = (await replay.json()) as { duplicate?: boolean };
  check("a replay of it is recognised, not scored twice", replay.status === 200 && replayBody.duplicate === true);
  check("...and the match still holds exactly one point", (await prisma.pointEvent.count({ where: { matchId: m.id } })) === 1);

  // --- decisions: 4xx, and the queue for that match is dropped ---------------

  const outOfStep = await send({ expectedSeq: 99 });
  check("a device out of step is refused with a 4xx", outOfStep.status >= 400 && outOfStep.status < 500, `status ${outOfStep.status}`);
  check("...and says it was refused rather than failed", ((await outOfStep.json()) as { refused?: boolean }).refused === true);

  const gone = await send({}, "no-such-match");
  check("a match that is no longer in the draw is refused, not retried for ever", gone.status >= 400 && gone.status < 500, `status ${gone.status}`);

  await prisma.match.update({ where: { id: m.id }, data: { status: "completed", winnerId: m.player1Id } });
  const finished = await send({});
  check("a match already over is refused", finished.status >= 400 && finished.status < 500, `status ${finished.status}`);
  await prisma.match.update({ where: { id: m.id }, data: { status: "in_progress", winnerId: null } });

  const badPin = await POST(
    new Request(`http://localhost/api/matches/${m.id}/point`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "9999", slot: 1 }),
    }),
    { params: { id: m.id } }
  );
  check("a wrong PIN is its own answer", badPin.status === 401, `status ${badPin.status}`);

  // --- and a fault is not any of those --------------------------------------
  // Nothing here can make the database fall over on demand, so the classifier
  // itself is checked: everything that is not a declared refusal must come back
  // as a 5xx, which is what tells the queue to keep the points and wait.

  const routeSrc = (await import("node:fs")).readFileSync("src/app/api/matches/[id]/point/route.ts", "utf8");
  check("the route classifies on the refusal type", /ScoringRefusal/.test(routeSrc));
  check("...answering 4xx for a refusal", /ScoringRefusal[\s\S]{0,240}status:\s*4\d\d/.test(routeSrc));
  check("...and 5xx for anything else", /status:\s*500/.test(routeSrc));
  check("a refusal is a distinct type, not a message match", typeof ScoringRefusal === "function");

  const routingSrc = (await import("node:fs")).readFileSync("src/lib/bracket/routing.ts", "utf8");
  const refusals = [...routingSrc.matchAll(/new ScoringRefusal\(/g)].length;
  check("every deliberate refusal in scorePoint is declared", refusals >= 4, `${refusals} found`);

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
