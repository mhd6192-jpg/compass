// Runs the whole check suite with one command.
//
//   npm run check       every pure-logic suite (fast, no database)
//   npm run check:db    the database-backed flows as well
//
// The database flows are the reason this exists. PGlite serves every connection
// from one shared session, and a full flow leaves that session unusable — so
// each one needs a freshly started database or it dies on connect with "Server
// has closed the connection". Doing that by hand is a dozen manual restarts and
// is easy to get wrong halfway through; this does it for you, one clean
// database per flow, and reports the lot at the end.
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { rmSync } from "node:fs";

const DB_PORT = Number(process.env.DEV_DB_PORT || 5433);

/** Pure logic: no database, so these can all run back to back. */
const LOGIC = [
  ["checkFormats", "the format registry"],
  ["checkAmericano", "americano rotation"],
  ["checkKingCourt", "king-of-the-court ladder"],
  ["checkWinnerCourt", "winner-court queue"],
  ["checkTeamAmericano", "team americano schedule"],
  ["checkMixicano", "mixicano schedule"],
  ["checkMixedMexicano", "mixed mexicano pairing"],
  ["checkMixedTeamAmericano", "mixed team americano schedule"],
  ["checkFlexRace", "configurable race + match point"],
  ["checkRace16", "the historical race rules"],
  ["checkDecider", "round-robin play-off"],
  ["checkTwoGroup", "two groups → semis → final"],
  ["checkOutbox429", "a lockout never eats queued points"],
  ["checkExport", "results that can leave the building"],
  ["checkCallout", "calling players who have wandered off"],
  ["checkStrengthOrder", "entry order from past results"],
  ["checkFreshness", "a screen admits when it stops updating"],
  ["testNew", "seeding and score entry"],
];

/** Each of these needs its own fresh database. */
const DB = [
  ["checkAuth", "who may write"],
  ["checkRateLimit", "PIN guessing is slowed, coaches are not"],
  ["checkRosters", "saved entrant lists"],
  ["checkArchive", "past events survive a reset"],
  ["checkMembers", "who plays here, across events"],
  ["checkField", "late arrivals, early leavers, stand-ins"],
  ["checkStateRev", "the polling revision misses nothing"],
  ["checkAmericanoFlow", "americano end to end"],
  ["checkRotatingSets", "rotating formats played as sets"],
  ["checkMexicano", "mexicano end to end"],
  ["checkKingCourtFlow", "king of the court end to end"],
  ["checkWinnerCourtFlow", "winner court end to end"],
  ["checkTeamAmericanoFlow", "team americano end to end"],
  ["checkMixicanoFlow", "mixicano end to end"],
  ["checkMixedMexicanoFlow", "mixed mexicano end to end"],
  ["checkMixedAmericanoFlow", "mixed americano end to end"],
  ["checkMixedTeamAmericanoFlow", "mixed team americano end to end"],
];

const GREEN = "[32m";
const RED = "[31m";
const DIM = "[2m";
const OFF = "[0m";

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: process.platform === "win32", ...opts });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

function portOpen(port) {
  return new Promise((resolve) => {
    const s = createConnection({ port, host: "127.0.0.1" });
    s.on("connect", () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    setTimeout(() => {
      s.destroy();
      resolve(false);
    }, 400);
  });
}

async function waitFor(port, want, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await portOpen(port)) === want) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function startDb() {
  const child = spawn(process.execPath, ["scripts/devDb.mjs"], { stdio: "ignore" });
  const up = await waitFor(DB_PORT, true);
  if (!up) {
    child.kill();
    throw new Error(`the dev database did not come up on port ${DB_PORT}`);
  }
  return child;
}

async function stopDb(child) {
  child.kill();
  await waitFor(DB_PORT, false, 10000);
}

async function main() {
  const withDb = process.argv.includes("--db");
  const results = [];

  console.log(`\n${DIM}Logic checks — no database needed${OFF}`);
  for (const [name, what] of LOGIC) {
    const { code, out } = await run("npx", ["tsx", `scripts/${name}.ts`]);
    const ok = code === 0;
    results.push({ name, ok });
    console.log(`  ${ok ? GREEN + "pass" : RED + "FAIL"}${OFF}  ${name.padEnd(26)} ${DIM}${what}${OFF}`);
    if (!ok) console.log(out.split("\n").filter((l) => l.includes("FAIL") || l.includes("Error")).slice(0, 6).map((l) => "        " + l).join("\n"));
  }

  if (withDb) {
    if (await portOpen(DB_PORT)) {
      console.log(
        `\n${RED}Port ${DB_PORT} is already in use.${OFF} Stop your dev database (and any dev server using it) first — this script starts its own, one per flow.`
      );
      process.exitCode = 1;
      return;
    }

    console.log(`\n${DIM}Database flows — a fresh database for each${OFF}`);
    // Start from empty so a half-finished earlier run cannot colour the results.
    rmSync(".pglite-dev", { recursive: true, force: true });
    let db = await startDb();
    const push = await run("npm", ["run", "dev:local:push"]);
    if (push.code !== 0) {
      console.log(`  ${RED}FAIL${OFF}  could not create the tables\n${push.out.split("\n").slice(-6).join("\n")}`);
      await stopDb(db);
      process.exitCode = 1;
      return;
    }
    await stopDb(db);

    for (const [name, what] of DB) {
      db = await startDb();
      const { code, out } = await run("npx", ["tsx", `scripts/${name}.ts`]);
      await stopDb(db);
      const ok = code === 0;
      results.push({ name, ok });
      console.log(`  ${ok ? GREEN + "pass" : RED + "FAIL"}${OFF}  ${name.padEnd(30)} ${DIM}${what}${OFF}`);
      if (!ok) console.log(out.split("\n").filter((l) => l.includes("FAIL") || l.includes("ERROR")).slice(0, 6).map((l) => "        " + l).join("\n"));
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    failed.length
      ? `\n${RED}${failed.length} of ${results.length} suites failed:${OFF} ${failed.map((r) => r.name).join(", ")}\n`
      : `\n${GREEN}All ${results.length} suites passed.${OFF}${withDb ? "" : `  ${DIM}(add --db for the database flows)${OFF}`}\n`
  );
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((e) => {
  console.error(`${RED}${e instanceof Error ? e.message : e}${OFF}`);
  process.exitCode = 1;
});
