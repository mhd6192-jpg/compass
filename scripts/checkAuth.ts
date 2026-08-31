// Who may write, against the real database.
//
// Five endpoints were open — seeding a tournament, saving and deleting entrant
// lists, archiving an event, and deleting a past one. They were not open by
// choice: `verifyPin` reads the PIN off the TournamentConfig row that a reset
// deletes, so at the moment someone seeds a draw there was nothing to check
// against. The organiser PIN is kept outside the tournament to close them.
//
// RESTART `npm run dev:db` BEFORE EACH RUN.
// `lib/auth` uses the app's own Prisma singleton, which reads its URL from the
// environment at import time — so this has to be set before that import, hence
// the dynamic one below. Testing the real module beats testing a copy of it.
const DEV_DB = "postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1";
process.env.POSTGRES_PRISMA_URL = DEV_DB;
process.env.POSTGRES_URL_NON_POOLING = DEV_DB;
process.env.DATABASE_URL = DEV_DB;


export {};

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  // Imported here, not at the top: tsx emits CommonJS, so there is no top-level
  // await, and these must not load until the URLs above are in the environment.
  const { claimOrganiser, organiserPin, setOrganiserPin, verifyOrganiser, verifyPin } = await import("../src/lib/auth");
  const { prisma } = await import("../src/lib/db");

  delete process.env.ORGANISER_PIN;
  await prisma.appSettings.deleteMany({});
  await prisma.tournamentConfig.deleteMany({});

  // --- unclaimed: an install that has just updated ---------------------------
  check("a fresh install is unclaimed", (await organiserPin()) === null);
  check("...so it accepts anything, rather than locking the organiser out", await verifyOrganiser("anything"));

  // --- claiming ---------------------------------------------------------------
  await claimOrganiser("2468");
  check("seeding claims the installation", (await organiserPin()) === "2468");
  check("the claimed PIN is accepted", await verifyOrganiser("2468"));
  check("a wrong PIN is refused", !(await verifyOrganiser("1234")));
  check("no PIN is refused", !(await verifyOrganiser(undefined)));
  check("an empty PIN is refused", !(await verifyOrganiser("")));
  check("a non-string is refused", !(await verifyOrganiser(2468 as unknown as string)));

  // Claiming is not how you change it — that would let anyone re-claim.
  await claimOrganiser("9999");
  check("claiming again does not overwrite the PIN", (await organiserPin()) === "2468");
  check("...and the new PIN is still refused", !(await verifyOrganiser("9999")));

  // --- the recovery path ------------------------------------------------------
  process.env.ORGANISER_PIN = "master-key";
  check("the environment PIN always works", await verifyOrganiser("master-key"));
  check("...and does not disable the stored one", await verifyOrganiser("2468"));
  check("...and still refuses everything else", !(await verifyOrganiser("nope")));
  delete process.env.ORGANISER_PIN;

  // --- the two PINs are different things --------------------------------------
  // A coach PIN belongs to the tournament and dies with it; that is exactly why
  // it cannot guard the act of creating one.
  await prisma.tournamentConfig.create({ data: { id: "default", pin: "5555", status: "active" } });
  check("the coach PIN checks the tournament", await verifyPin("5555"));
  check("the coach PIN is not the organiser PIN", !(await verifyOrganiser("5555")));
  check("the organiser PIN is not the coach PIN", !(await verifyPin("2468")));

  // The reset that used to lose the PIN.
  await prisma.tournamentConfig.deleteMany({});
  check("after a reset there is no coach PIN", !(await verifyPin("5555")));
  check("...but the organiser PIN survives", await verifyOrganiser("2468"));
  check("...which is what makes seeding checkable at all", (await organiserPin()) === "2468");

  // --- rotation ---------------------------------------------------------------
  // Claiming only ever fills an empty slot, so changing the PIN is its own act —
  // and the caller must have proved the current one first, which is the API's job.
  await setOrganiserPin("1357");
  check("the organiser PIN can be changed", (await organiserPin()) === "1357");
  check("the new PIN is accepted", await verifyOrganiser("1357"));
  check("the old PIN stops working", !(await verifyOrganiser("2468")));

  // --- what the separation is actually for -------------------------------------
  // A coach holding the scoring PIN must not be able to wipe the draw. Reset and
  // seeding check the organiser PIN; scoring checks the tournament's.
  await prisma.tournamentConfig.create({ data: { id: "default", pin: "coach-pin", status: "active" } });
  check("a coach can score with the coach PIN", await verifyPin("coach-pin"));
  check("a coach CANNOT pass the organiser check", !(await verifyOrganiser("coach-pin")));
  check("the organiser can still score if they know the coach PIN", await verifyPin("coach-pin"));
  check("the organiser PIN is not accepted for scoring", !(await verifyPin("1357")));

  await prisma.tournamentConfig.deleteMany({});
  await prisma.appSettings.deleteMany({});
  await prisma.$disconnect();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
